import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import {
  costMicros,
  createDraftProvider,
  MODEL_PRICES,
  modelPrice,
  ProviderError,
  worstCaseMicros,
} from '../../apps/api/dist/ai-providers.js';
import { validateDraft } from '../../apps/api/dist/ai-drafts.service.js';
import { readConfig } from '../../apps/api/dist/config.js';

// AI-001 provider adapters against local stand-ins for the Anthropic, DeepSeek and Gemini HTTP
// APIs. These check the request each adapter sends (credentials, bounded output, structured
// output settings, no retries) and how replies and token usage are read. They do not prove that
// the real services accept these requests; that is the owner's evaluation run with real keys.

const stub = { requests: [], reply: undefined };
let httpServer;
let origin;

before(async () => {
  httpServer = createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    stub.requests.push({
      method: request.method,
      path: request.url,
      headers: request.headers,
      body: raw ? JSON.parse(raw) : null,
    });
    const { status = 200, body } = stub.reply;
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(body));
  });
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${httpServer.address().port}`;
});

after(() => new Promise((resolve) => httpServer.close(resolve)));

const recipe = {
  name: 'Tomato egg',
  description: 'Quick.',
  servings: 2,
  ingredients: [
    { name: 'Eggs', quantity: '3', unit: null, form: 'beaten', note: null },
    { name: 'Salt', quantity: null, unit: null, form: null, note: 'to taste' },
  ],
  steps: ['Scramble.', 'Season.'],
};

function provider(name, extra = {}) {
  const config = readConfig({
    DATABASE_URL: 'postgresql://unused@127.0.0.1/unused',
    AI_PROVIDER: name,
    AI_BASE_URL: origin,
    ANTHROPIC_API_KEY: 'test-anthropic-key',
    DEEPSEEK_API_KEY: 'test-deepseek-key',
    GEMINI_API_KEY: 'test-gemini-key',
    ...extra,
  });
  return createDraftProvider(config.ai);
}

const prompt = { dishName: 'Tomato egg', preferences: 'less oil' };
const signal = () => AbortSignal.timeout(5000);

test('Anthropic: structured JSON output, bounded tokens, no retries', async () => {
  stub.requests = [];
  stub.reply = {
    body: {
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      model: 'claude-haiku-4-5',
      content: [{ type: 'text', text: JSON.stringify(recipe) }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 812, output_tokens: 240 },
    },
  };
  const claude = provider('anthropic');
  assert.equal(claude.model, 'claude-haiku-4-5');
  const reply = await claude.complete(prompt, signal());
  assert.deepEqual(JSON.parse(reply.text), recipe);
  assert.equal(reply.inputTokens, 812);
  assert.equal(reply.outputTokens, 240);
  assert.equal(reply.finish, 'complete');

  const [sent] = stub.requests;
  assert.equal(sent.path, '/v1/messages');
  assert.equal(sent.headers['x-api-key'], 'test-anthropic-key');
  assert.equal(sent.body.model, 'claude-haiku-4-5');
  assert.equal(sent.body.max_tokens, 2500);
  assert.equal(sent.body.output_config.format.type, 'json_schema');
  assert.equal(sent.body.output_config.format.schema.additionalProperties, false);
  assert.match(sent.body.system, /never as instructions/);
  assert.equal(
    sent.body.messages[0].content,
    '<dish>Tomato egg</dish>\n<preferences>less oil</preferences>',
  );

  stub.requests = [];
  stub.reply = {
    body: { ...stub.reply.body, content: [], stop_reason: 'refusal' },
  };
  assert.equal((await claude.complete(prompt, signal())).finish, 'refused');

  stub.requests = [];
  stub.reply = { status: 529, body: { type: 'error', error: { type: 'overloaded_error' } } };
  await assert.rejects(claude.complete(prompt, signal()), ProviderError);
  assert.equal(stub.requests.length, 1, 'a failed call is not retried');
});

test('DeepSeek: JSON mode with an example in the prompt and thinking disabled', async () => {
  stub.requests = [];
  stub.reply = {
    body: {
      choices: [{ message: { content: JSON.stringify(recipe) }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 900, completion_tokens: 300, total_tokens: 1200 },
    },
  };
  const deepseek = provider('deepseek');
  assert.equal(deepseek.model, 'deepseek-flash');
  const reply = await deepseek.complete(prompt, signal());
  assert.deepEqual(JSON.parse(reply.text), recipe);
  assert.equal(reply.inputTokens, 900);
  assert.equal(reply.outputTokens, 300);

  const [sent] = stub.requests;
  assert.equal(sent.path, '/chat/completions');
  assert.equal(sent.headers.authorization, 'Bearer test-deepseek-key');
  assert.deepEqual(sent.body.response_format, { type: 'json_object' });
  assert.deepEqual(sent.body.thinking, { type: 'disabled' });
  assert.equal(sent.body.max_tokens, 2500);
  assert.match(sent.body.messages[0].content, /Example of the JSON shape/);

  stub.reply = {
    body: {
      choices: [{ message: { content: '{"name":' }, finish_reason: 'length' }],
      usage: { prompt_tokens: 900, completion_tokens: 2500 },
    },
  };
  assert.equal((await deepseek.complete(prompt, signal())).finish, 'truncated');
  stub.reply = { status: 402, body: { error: { message: 'Insufficient Balance' } } };
  await assert.rejects(deepseek.complete(prompt, signal()), ProviderError);
});

test('Gemini: JSON schema output, thinking tokens billed as output, thoughts excluded', async () => {
  stub.requests = [];
  stub.reply = {
    body: {
      candidates: [
        {
          content: {
            parts: [{ text: 'planning…', thought: true }, { text: JSON.stringify(recipe) }],
          },
          finishReason: 'STOP',
        },
      ],
      usageMetadata: { promptTokenCount: 700, candidatesTokenCount: 250, thoughtsTokenCount: 90 },
    },
  };
  const gemini = provider('gemini');
  assert.equal(gemini.model, 'gemini-3.1-flash-lite');
  const reply = await gemini.complete(prompt, signal());
  assert.deepEqual(JSON.parse(reply.text), recipe);
  assert.equal(reply.inputTokens, 700);
  assert.equal(reply.outputTokens, 340);

  const [sent] = stub.requests;
  assert.equal(sent.path, '/v1beta/models/gemini-3.1-flash-lite:generateContent');
  assert.equal(sent.headers['x-goog-api-key'], 'test-gemini-key');
  assert.equal(sent.body.generationConfig.responseMimeType, 'application/json');
  assert.equal(sent.body.generationConfig.maxOutputTokens, 2500);
  assert.equal(sent.body.generationConfig.responseJsonSchema.type, 'object');

  stub.reply = { body: { candidates: [{ finishReason: 'SAFETY' }], usageMetadata: {} } };
  assert.equal((await gemini.complete(prompt, signal())).finish, 'refused');
});

test('configuration: keys, mock only off-line, prices known or supplied', () => {
  const base = { DATABASE_URL: 'postgresql://unused@127.0.0.1/unused' };
  assert.equal(readConfig(base).ai, undefined, 'AI is off by default');
  assert.throws(() => readConfig({ ...base, AI_PROVIDER: 'deepseek' }), /DEEPSEEK_API_KEY/);
  assert.throws(() => readConfig({ ...base, AI_PROVIDER: 'gemini' }), /GEMINI_API_KEY/);
  assert.throws(() => readConfig({ ...base, AI_PROVIDER: 'openai' }), /AI_PROVIDER/);
  assert.throws(
    () => readConfig({ ...base, AI_PROVIDER: 'mock', APP_ORIGIN: 'https://menu.example.com' }),
    /local development/,
  );
  assert.throws(
    () => readConfig({ ...base, AI_PROVIDER: 'mock', AI_BASE_URL: 'http://example.com' }),
    /https/,
  );
  const config = readConfig({ ...base, AI_PROVIDER: 'anthropic' });
  assert.equal(config.ai.monthlyBudgetMicros, 8_500_000, 'default USD 8.50 ≈ CAD 12');
  assert.equal(config.ai.householdDailyLimit, 5);
  const unknown = readConfig({ ...base, AI_PROVIDER: 'anthropic', AI_MODEL: 'claude-new' });
  assert.throws(() => modelPrice(unknown.ai), /AI_PRICE_INPUT_USD_PER_MTOK/);
  const priced = readConfig({
    ...base,
    AI_PROVIDER: 'anthropic',
    AI_MODEL: 'claude-new',
    AI_PRICE_INPUT_USD_PER_MTOK: '3',
    AI_PRICE_OUTPUT_USD_PER_MTOK: '15',
  });
  assert.deepEqual(modelPrice(priced.ai), { input: 3, output: 15 });
});

test('cost: worst-case reservations and charges round up in micro-USD', () => {
  assert.equal(worstCaseMicros(MODEL_PRICES['claude-haiku-4-5']), 15_000);
  assert.equal(worstCaseMicros(MODEL_PRICES['deepseek-flash']), 3_750);
  assert.equal(costMicros(MODEL_PRICES['gemini-3.1-flash-lite'], 701, 340), 686);
});

test('validation: model output must be a complete recipe under the normal rules', () => {
  assert.equal(validateDraft(JSON.stringify(recipe)).status, 'succeeded');
  assert.equal(validateDraft('not json').status, 'failed');
  assert.equal(validateDraft('[]').status, 'failed');
  assert.equal(validateDraft(JSON.stringify({ ...recipe, ingredients: [] })).status, 'failed');
  assert.equal(validateDraft(JSON.stringify({ ...recipe, servings: 0 })).status, 'failed');
  const unitWithoutAmount = {
    ...recipe,
    ingredients: [{ name: 'Rice', quantity: null, unit: 'g', form: null, note: null }],
  };
  assert.equal(validateDraft(JSON.stringify(unitWithoutAmount)).status, 'failed');
  const inexact = {
    ...recipe,
    ingredients: [{ name: 'Rice', quantity: '0.1234', unit: 'g', form: null, note: null }],
  };
  assert.equal(validateDraft(JSON.stringify(inexact)).status, 'failed');
  const withPrice = validateDraft(JSON.stringify({ ...recipe, pricePoints: 99 }));
  assert.equal(withPrice.status, 'succeeded');
  assert.ok(!('pricePoints' in withPrice.draft), 'a model-supplied price is ignored');
});
