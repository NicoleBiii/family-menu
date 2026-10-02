# ADR 0006 — AI recipe drafts, quotas and provider choice

Date: 2026-09-27. Status: implemented and locally verified (AI-001). Provider chosen for now on 2026-09-28: **Google Gemini 3.1 Flash-Lite, paid tier** (below).

## Owner decisions (2026-09-27)

- Evaluate three candidates before choosing: **Claude Haiku 4.5** (Anthropic), **DeepSeek V4.1 Flash** (`deepseek-flash`) and **Gemini 3.1 Flash-Lite**. The comparison and its sources are in WORK_LOG 2026-09-27.
- AI spend cap stays **CAD 12 per month** (BUDGET.md). The application enforces it as USD 8.50 per UTC month, about CAD 12 at 1.39 CAD per USD, rounded down.
- Use provider API keys stored in `.env` and host secrets, not workload identity federation, for now. Local runs cannot use federation, the Railway plan has no documented workload OIDC token, and it would cover only one of the three providers. This can be revisited at INFRA-001.

## Decisions

- **One durable row per request.** `app.ai_draft_requests` is both the job (`queued → running → succeeded | failed`) and its cost reservation. It merges ARCHITECTURE.md's `AiDraftRequest` and `AiUsageReservation`: one row cannot drift from its reservation. `reserved_micros` holds the worst-case charge. `charged_micros` holds the actual charge once the provider reports usage.
- **Admission under one lock.** Creating a request takes a transaction-scoped advisory lock and then checks three limits in order. Crossing any of them refuses the request.
  - **Household:** drafts in progress or produced in the last 24 hours must stay below `AI_HOUSEHOLD_DAILY_LIMIT` (default 5); crossing it returns 429 `household_limit`. Failed drafts do not count; discarded ones do.
  - **Person:** attempts in the last 24 hours, failures included, must stay below `AI_USER_DAILY_ATTEMPTS` (default 10); crossing it returns 429 `user_limit`. This is the abuse limit.
  - **Budget:** this month's `sum(coalesce(charged, reserved))` plus the new worst-case reservation must stay within the budget; crossing it returns 503 `budget_exhausted`.

  A warning is logged above 80% of the budget. The lock serializes admission across concurrent requests and application instances. At this scale that costs nothing.

- **Worst-case reservation.** 2,500 prompt tokens plus 2,500 output tokens (the enforced `max_tokens`) at the model's price: USD 0.015 for Haiku 4.5, 0.00375 for DeepSeek Flash, 0.004375 for Gemini 3.1 Flash-Lite. Prices come from a built-in table dated 2026-09-27; where a price varies, the higher value is used (DeepSeek peak, Gemini 3.8 Flash's 2027 rate, no cache discount). A model outside the table needs explicit `AI_PRICE_*` settings, otherwise startup fails. _Superseded on 2026-10-02 by [ADR 0007](0007-recipe-categories.md): the prompt now carries household category names, so the input bound is 5,000 tokens (USD 0.0175, 0.0045 and 0.005 respectively)._
- **No blind retries.** SDK retries are off. A timed-out or interrupted call may already be billed, so it keeps its full reservation, is failed, and is never retried automatically. A queued job that never started within 5 minutes fails as `expired`; since it never reached the provider, its reservation is released.
- **Worker.** An in-process worker claims queued jobs with `FOR UPDATE SKIP LOCKED` and a lease (timeout + 60 s). It runs at most 2 provider calls at once, triggered on each new request and every 5 s. Expired leases are recovered as `interrupted` before each claim and on every read, so a killed process leaves a failed row rather than a spinner. The browser polls `GET …/ai-drafts/:id`.
- **Drafts stay drafts (AC-06).** A finished draft is only JSON on the request row. The member edits it in the normal recipe editor, sets the price and saves.
  - **Save.** Saving uses the draft id as the recipe's idempotency key and records `recipes.source = 'ai'` and `source_ai_draft_id` (unique). A double save, or two members saving at once, returns one recipe.
  - **Discard.** Discarding changes nothing in the menu. A discarded draft cannot be saved and a saved one cannot be discarded.
  - **Who may act.** Every current member may review, save or discard household drafts (shared-menu rule). Other households, and removed members, get 404.
- **Validation.** The model output is parsed and run through `parseRecipeInput`, the same rules as manual entry: units from the fixed list, exact decimals, and length limits. It must have at least one ingredient and one step. A model-supplied price is ignored. Invalid, truncated or refused output is a failed draft with the provider's reported charge.
- **Prompt and privacy.** Only the dish name (≤ 80 characters) and preferences (≤ 300) are sent. _Since ADR 0007, up to 30 household category names (≤ 40 characters each) are also sent._ They go inside `<dish>`/`<preferences>` tags with angle brackets stripped, and the system prompt treats them as description, not instructions. No account, household or member data is sent. Logs record provider, model, latency, tokens and cost, never the dish text or draft. The prompt tells the model not to claim allergy or diet suitability; the UI tells people to check amounts, times and allergens.
- **Providers.** One interface with four adapters. None retries, and each one's request shape is covered by stub tests.
  - **Anthropic** uses the official SDK (`@anthropic-ai/sdk` 0.128.0, the one new runtime dependency) with `output_config.format` JSON-schema structured outputs.
  - **DeepSeek** uses REST `chat/completions` with `response_format: json_object`, `thinking: disabled` and a JSON example in the prompt. JSON mode guarantees valid JSON, not the schema.
  - **Gemini** uses REST `generateContent` with `responseJsonSchema` and `thinkingLevel: low`; thinking tokens are billed at the output rate.
  - **Mock** is deterministic, for tests and local work, and is refused on an https origin.
- **Switch.** `AI_PROVIDER=off` (the default) disables drafts with 503 `ai_disabled`, and the UI offers manual entry. Changing it needs a restart; there is no runtime toggle yet.

## Evaluation (to run with the owner's keys)

`npm run ai:eval -- --providers anthropic,deepseek,gemini` shows the worst-case cost (USD 0.37 for 16 cases × 3 providers). With `--yes` it sends the same 16 cases through the production adapters and validation. The cases cover English, Chinese, mixed, vague, not-a-dish and prompt-injection inputs. It writes `docs/verification/ai-eval/<date>-results.json`, with schema validity, latency, tokens and cost, and `<date>-drafts.md`, a usable-or-not checklist for a person to fill in. The choice goes into this ADR with the measured numbers.

## Evaluation results (2026-09-27/28)

Same 16 cases through the production adapters; raw results and drafts in `docs/verification/ai-eval/`. The 2026-09-27 run used the original validation; the owner then approved a repair of two near-misses (a quantity written as the text "null", and a unit such as "pinch" without an amount: the unit is dropped and the note kept, never an invented amount) plus one prompt sentence, and a second run.

| Provider / model               | Run 1: valid      | Run 2: valid                  | Median / p90 latency (run 2) | Avg cost per draft | Notes                                                                                                                                                     |
| ------------------------------ | ----------------- | ----------------------------- | ---------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anthropic `claude-haiku-4-5`   | 14/16             | 16/16                         | 4.9 / 7.9 s                  | USD 0.0035         | Run-1 failures were both near-misses, now repaired                                                                                                        |
| DeepSeek `deepseek-flash`      | 16/16             | 14/16                         | 2.0 / 2.7 s                  | USD 0.0006         | Run 2: unit "根" outside the list; one reply was not valid JSON (JSON mode does not enforce a schema)                                                     |
| Google `gemini-3.1-flash-lite` | 15/16 (free tier) | 16/16 (paid tier, 2026-09-28) | 2.7 / 3.5 s                  | USD 0.0011         | A second free-tier run failed 14/16 with errors before any token, most likely free-tier rate limits (status not recorded then; the script now records it) |

Injection and not-a-dish inputs produced harmless recipes from all three; none revealed the prompt. Owner's usable-draft review (2026-09-28, run-2 drafts; Gemini from its paid-tier run): Anthropic 16/16, Gemini 16/16, DeepSeek 14/16 (the two unusable ones are its two validation failures).

**Choice (owner, 2026-09-28): Gemini 3.1 Flash-Lite on the paid tier, for now.** It matched Haiku on validity and usability at about half the latency and a third of the cost, and paid-tier content is not used to improve Google's products. Claude Haiku 4.5 is the tested alternative; switching is `AI_PROVIDER=anthropic` plus its key. Production must use a paid Gemini key (billing enabled); the free tier is not acceptable for household input.

Real-provider smoke test (2026-09-28): one draft ("可乐鸡翅", preferences "少糖") through `AiDraftsService`, PostgreSQL, the worker and validation, then saved as a recipe with `source: 'ai'`: succeeded in 2.6 s, 364/448 tokens, charged 763 micro-USD against a 4,375 reservation. The browser path with real Google sign-in and real Gemini is left for the INFRA-001 staging smoke test.

## Consequences and limits

- AC-06 and AC-13 are covered by PostgreSQL integration tests and browser tests with the mock. Three mutation checks each failed their intended tests: removing the admission lock, allowing a save after discard, and releasing timed-out reservations. The adapters are tested only against local stubs. The real APIs are unverified until the evaluation run, and Gemini's `anyOf` schema support and `thinkingLevel` value in particular come from documentation only.
- The provider dashboards' own caps are a second line of defence. The evaluation script's spend is outside the application's budget ledger.
- Retention: request rows, with dish name, preferences and draft, are kept indefinitely with the household and deleted with it. A retention period can be added later.
- A config change of provider or model while jobs are queued is not handled specially; those jobs run on the new provider under their old reservation.
