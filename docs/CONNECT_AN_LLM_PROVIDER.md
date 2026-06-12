# How to Connect an LLM Provider to Indigold

Indigold's intelligence layer (RADIAN) is **provider-agnostic**. It ships running on
a deterministic stub (no keys, no spend) and can be pointed at one or several real
LLM providers **without any code change** — you just set environment variables in
Render and redeploy.

## Important: your subscription is NOT an API key

> Your **Claude Pro / ChatGPT Plus** subscriptions are for the chat apps. They are
> **separate** from **API access**. Indigold calls provider **APIs**, which need a
> provider **API token** (a `sk-...` style key) created in that provider's developer
> console and billed separately (usually pay-as-you-go).

So "I have my LLM token for provider X" means: you created an API key in provider X's
console. You then add it to Indigold **securely via Render env vars** — never in code,
never pasted into the app, never stored in the database.

## Security model (what Indigold guarantees)

- Keys live **only** in Render environment variables (or a future encrypted secret
  manager). They are **never** committed, logged, returned by any API response,
  exposed to the PWA, stored in `localStorage`, or printed in errors (auth headers
  and keys are redacted).
- `GET /llm/status` reports only **presence** (`configured: true/false`) and a safe
  `reason` (`missing_env_var`) — never a value.
- `POST /llm/provider-config` **does not accept or store keys**; it only tells you
  which env var to set.

## Run modes (`LLM_MODE`)

| Mode | Behavior |
| :-- | :-- |
| `stub` (default when no keys) | Deterministic fake responses. No network, no spend. Used by tests/CI and the sandbox. |
| `live` (default when any key is set) | Real provider calls. Refuses (gracefully) if the chosen provider's key is missing. |
| `replay` | Recorded golden responses for deterministic tests. |

You normally don't set `LLM_MODE` — it infers `live` once any key is present.

## Enable a provider (3 steps each)

In **Render → your `indigold-api` service → Environment**, add the variable, then
**redeploy**. Confirm with `GET /llm/status` (Bearer token from the app's I/O page).

### Anthropic (first-class default)
1. Create a key at the Anthropic Console (API, not the Claude app).
2. Set `ANTHROPIC_API_KEY=sk-ant-...`
3. Redeploy. `/llm/status` → `anthropic.configured: true`.

### OpenAI
1. Create a key at the OpenAI API platform.
2. Set `OPENAI_API_KEY=sk-...`
3. Redeploy.

### OpenRouter (one key → many models, incl. Perplexity Sonar for research)
1. Create a key at openrouter.ai.
2. Set `OPENROUTER_API_KEY=sk-or-...`
3. Redeploy.

### Google Gemini
1. Create a key in Google AI Studio.
2. Set `GEMINI_API_KEY=...`
3. Redeploy.

### Local / Ollama (no key — a base URL)
1. Run Ollama somewhere reachable by the API.
2. Set `OLLAMA_BASE_URL=http://your-host:11434`
3. Redeploy.

## Switch providers without code changes

RADIAN picks a provider **per task**. Defaults keep Anthropic first-class; override
any of these (then redeploy):

```
LLM_DEFAULT_PROVIDER=openrouter         # fallback for any unset task
LLM_CLASSIFICATION_PROVIDER=anthropic   # cheap, high-volume ingest
LLM_SYNTHESIS_PROVIDER=openai           # briefs / planning
LLM_RESEARCH_PROVIDER=openrouter        # e.g. perplexity/sonar for web research
LLM_PLANNING_PROVIDER=anthropic
```

Optionally pin a model for a task: `LLM_CLASSIFICATION_MODEL=claude-3-5-haiku-latest`,
`LLM_RESEARCH_MODEL=perplexity/sonar`, etc. If unset, a sensible per-provider default
is used.

Example "use OpenRouter for everything except classification on Anthropic":
```
LLM_DEFAULT_PROVIDER=openrouter
LLM_CLASSIFICATION_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
OPENROUTER_API_KEY=sk-or-...
```

## Cost governance (always on)

- `RADIAN_MONTHLY_BUDGET_CENTS` (default `1500` = $15/mo) caps spend.
- Under 80%: normal. 80–99%: degrade to the cheap tier / classification-only.
  100%+: jobs **queue** instead of calling the model (no surprise spend).
- Every call logs to the `ai_calls` ledger: provider, model, task, tokens in/out,
  estimated cost, source id, prompt version, success/failure, timestamp.
- See month-to-date spend + state in `GET /llm/status` (`budget` block) and the
  PWA I/O panel.

## Quick check

```
TOKEN=<I/O → Device token → Copy>
curl -s -H "authorization: Bearer $TOKEN" https://indigold-api.onrender.com/llm/status
```
You'll see each provider's `configured` flag, the active default, the mode, the
per-task routing, and the budget state — and **no secrets**.
