// AI-001 provider evaluation. Sends the same recipe-draft requests to each configured provider
// through the application's own adapters and validation, and records schema validity, latency,
// token usage and cost. Usability ("would we keep this draft?") is judged by a person from the
// drafts file this script writes.
//
//   npm run build --workspace @family-menu/api
//   node --env-file-if-exists=.env scripts/ai-eval.mjs --providers anthropic,deepseek,gemini
//   node --env-file-if-exists=.env scripts/ai-eval.mjs --providers anthropic,deepseek,gemini --yes
//
// Without --yes it only prints the worst-case cost. Keys come from ANTHROPIC_API_KEY,
// DEEPSEEK_API_KEY and GEMINI_API_KEY; AI_MODEL is ignored so each provider uses its default
// model unless --model provider=model is given. Every call is billed by the provider.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { validateDraft } from '../apps/api/dist/ai-drafts.service.js';
import {
  costMicros,
  createDraftProvider,
  modelPrice,
  worstCaseMicros,
} from '../apps/api/dist/ai-providers.js';
import { readConfig } from '../apps/api/dist/config.js';

const { values } = parseArgs({
  options: {
    providers: { type: 'string', default: 'anthropic,deepseek,gemini' },
    model: { type: 'string', multiple: true, default: [] },
    cases: { type: 'string', default: 'scripts/ai-eval-cases.json' },
    out: { type: 'string', default: 'docs/verification/ai-eval' },
    yes: { type: 'boolean', default: false },
  },
});

const cases = JSON.parse(await readFile(values.cases, 'utf8'));
const models = Object.fromEntries(values.model.map((pair) => pair.split('=')));
const setups = values.providers.split(',').map((name) => {
  const env = {
    ...process.env,
    DATABASE_URL: 'postgresql://unused@127.0.0.1/unused',
    APP_ORIGIN: '',
    AI_PROVIDER: name.trim(),
    AI_MODEL: models[name.trim()] ?? '',
    AI_BASE_URL: '',
  };
  try {
    const { ai } = readConfig(env);
    return { config: ai, provider: createDraftProvider(ai), price: modelPrice(ai) };
  } catch (error) {
    console.error(`${name}: ${error.message}`);
    process.exit(1);
  }
});

const worst = setups.reduce((sum, setup) => sum + worstCaseMicros(setup.price) * cases.length, 0);
console.log(
  `${cases.length} cases × ${setups.map((s) => `${s.config.provider}/${s.config.model}`).join(', ')}`,
);
console.log(`Worst-case cost: USD ${(worst / 1e6).toFixed(4)} (expected to be far lower).`);
if (!values.yes) {
  console.log('Nothing was sent. Re-run with --yes to call the providers.');
  process.exit(0);
}

const results = [];
for (const setup of setups) {
  for (const item of cases) {
    const started = performance.now();
    let reply;
    let outcome;
    try {
      reply = await setup.provider.complete(
        { dishName: item.dishName, preferences: item.preferences },
        AbortSignal.timeout(setup.config.timeoutMs),
      );
      outcome =
        reply.finish === 'complete'
          ? validateDraft(reply.text)
          : { status: 'failed', code: reply.finish };
    } catch (error) {
      outcome = { status: 'failed', code: error.name === 'TimeoutError' ? 'timeout' : 'error' };
    }
    const latencyMs = Math.round(performance.now() - started);
    const known = reply && reply.inputTokens !== null && reply.outputTokens !== null;
    const result = {
      provider: setup.config.provider,
      model: setup.config.model,
      case: item.id,
      dishName: item.dishName,
      status: outcome.status,
      code: outcome.code ?? null,
      latencyMs,
      inputTokens: reply?.inputTokens ?? null,
      outputTokens: reply?.outputTokens ?? null,
      costMicros: known ? costMicros(setup.price, reply.inputTokens, reply.outputTokens) : null,
      draft: outcome.draft ?? null,
      rawOnFailure: outcome.status === 'failed' ? (reply?.text ?? '').slice(0, 2000) : null,
    };
    results.push(result);
    console.log(
      `${result.provider.padEnd(9)} ${item.id.padEnd(14)} ${result.status.padEnd(9)} ` +
        `${String(latencyMs).padStart(6)} ms  ${result.inputTokens ?? '?'}/${result.outputTokens ?? '?'} tokens` +
        (result.code ? `  (${result.code})` : ''),
    );
  }
}

const percentile = (list, share) =>
  list.length
    ? list.sort((a, b) => a - b)[Math.min(list.length - 1, Math.floor(share * list.length))]
    : null;
const summary = setups.map(({ config }) => {
  const rows = results.filter((row) => row.provider === config.provider);
  const valid = rows.filter((row) => row.status === 'succeeded');
  const costs = rows.map((row) => row.costMicros).filter((value) => value !== null);
  const average = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);
  return {
    provider: config.provider,
    model: config.model,
    cases: rows.length,
    schemaValid: valid.length,
    medianLatencyMs: percentile(
      rows.map((row) => row.latencyMs),
      0.5,
    ),
    p90LatencyMs: percentile(
      rows.map((row) => row.latencyMs),
      0.9,
    ),
    averageInputTokens: Math.round(
      average(rows.map((r) => r.inputTokens).filter((v) => v !== null)) ?? 0,
    ),
    averageOutputTokens: Math.round(
      average(rows.map((r) => r.outputTokens).filter((v) => v !== null)) ?? 0,
    ),
    averageCostUsd: average(costs) === null ? null : average(costs) / 1e6,
  };
});

const date = new Date().toISOString().slice(0, 10);
await mkdir(values.out, { recursive: true });
await writeFile(
  `${values.out}/${date}-results.json`,
  `${JSON.stringify({ date, summary, results }, null, 2)}\n`,
);
const lines = [
  `# AI draft evaluation ${date}`,
  '',
  'Generated by `scripts/ai-eval.mjs`. Mark each draft usable or not, then record the usable-draft rate per provider in the ADR.',
  '',
  '| Provider | Model | Schema-valid | Median / p90 latency | Avg tokens in/out | Avg cost (USD) | Cost per 1,000 drafts |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  ...summary.map(
    (row) =>
      `| ${row.provider} | ${row.model} | ${row.schemaValid}/${row.cases} | ${row.medianLatencyMs} / ${row.p90LatencyMs} ms | ${row.averageInputTokens} / ${row.averageOutputTokens} | ${row.averageCostUsd?.toFixed(5) ?? '?'} | ${row.averageCostUsd === null ? '?' : (row.averageCostUsd * 1000).toFixed(2)} |`,
  ),
  '',
];
for (const row of results) {
  lines.push(`## ${row.provider} · ${row.case} · ${row.dishName}`, '');
  lines.push(
    `- [ ] usable as a first draft`,
    `- Status: ${row.status}${row.code ? ` (${row.code})` : ''}, ${row.latencyMs} ms`,
    '',
  );
  if (row.draft) {
    lines.push(
      `**${row.draft.name}** — ${row.draft.description} (serves ${row.draft.servings})`,
      '',
    );
    for (const line of row.draft.ingredients) {
      lines.push(
        `- ${[line.quantity, line.unit, line.name].filter(Boolean).join(' ')}${line.form ? `, ${line.form}` : ''}${line.note ? ` (${line.note})` : ''}`,
      );
    }
    lines.push('');
    row.draft.steps.forEach((step, index) => lines.push(`${index + 1}. ${step}`));
  } else if (row.rawOnFailure) {
    lines.push('```', row.rawOnFailure, '```');
  }
  lines.push('');
}
await writeFile(`${values.out}/${date}-drafts.md`, lines.join('\n'));
console.table(summary);
console.log(`Wrote ${values.out}/${date}-results.json and ${values.out}/${date}-drafts.md`);
