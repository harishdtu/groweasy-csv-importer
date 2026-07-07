# GrowEasy CSV Importer

An AI-powered CSV importer that accepts leads exported from **any** source — Facebook Lead Ads, Google Ads, Excel sheets, real-estate CRM exports, sales reports, or manually created spreadsheets — and intelligently maps them into GrowEasy's fixed CRM schema, regardless of column names or layout.
# GrowEasy CSV Importer

An AI-powered CSV importer that accepts leads exported from **any** source — Facebook Lead Ads, Google Ads, Excel sheets, real-estate CRM exports, sales reports, or manually created spreadsheets — and intelligently maps them into GrowEasy's fixed CRM schema, regardless of column names or layout.

Built with **Next.js 14 (App Router) + TypeScript + Tailwind CSS** on the frontend, and **Next.js API routes (Node.js)** on the backend, calling an LLM (Gemini / OpenAI / Anthropic — pluggable) to do the actual field mapping.

## Live demo & repo

- Hosted app: `<add your deployed URL here>`
- GitHub repo: `<add your repo URL here>`

## How it works

1. **Upload** — user drags/drops or picks a `.csv` file.
2. **Preview** — the file is parsed entirely client-side with PapaParse and shown in a sticky-header, scrollable table. **No AI call happens at this stage.**
3. **Confirm** — user clicks "Confirm & Import". Only now does the app talk to the backend.
4. **AI mapping** — the frontend splits rows into batches of 20 and sends each batch to `POST /api/parse-batch`, with up to 3 batches in flight concurrently and up to 2 automatic retries per failed batch. A progress bar tracks batches completed.
5. **Result** — a second table shows every row with an "Imported" / "Skipped" status, a live count of totals, a filter (All / Imported / Skipped), and a "Download CRM CSV" button that exports only the successfully imported rows in valid CSV.

## Why this architecture

- **Stateless & horizontally scalable** — the backend holds no session state; every batch request is self-contained (`headers`, `rows`, `startIndex`), so it can be deployed as serverless functions with no database required.
- **Batching on the client, not the server** — this keeps each request small (fast, well within LLM context/token limits, safe from platform request-size limits) and gives real, granular progress feedback and per-batch retry instead of an opaque single blocking call.
- **Provider-agnostic AI layer** (`lib/ai.ts`) — switch between Gemini, OpenAI, or Anthropic with one environment variable; no code changes needed.

## Prompt engineering approach

The system prompt (see `lib/ai.ts` → `buildSystemPrompt`) encodes every rule from the assignment directly, rather than relying on the model to infer them:

- The full target schema and field meanings are spelled out explicitly.
- Enum fields (`crm_status`, `data_source`) list their exact allowed values inline, with instructions to map by **intent** (e.g. "Not interested" → `BAD_LEAD`, "Deal closed" → `SALE_DONE`) and to fall back to `""` rather than inventing values.
- Multi-value fields (extra emails/phones) are explicitly folded into `crm_note` per the spec.
- The model is instructed to reason from **both header names and the actual data shape**, since headers alone are unreliable across Facebook/Google/manual exports.
- Output is constrained to a raw JSON array, same order as input, with a `skip`/`skipReason` flag per row — this keeps the batch atomic and order-preserving, which is what makes safe client-side re-assembly possible.
- The backend never trusts the model blindly: `sanitizeRow()` in `lib/ai.ts` re-validates every enum value, re-checks the date is parseable via `new Date(...)`, and **re-enforces the "must have email or mobile" skip rule server-side** even if the model forgets it.

## Getting started locally

```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables
cp .env.example .env.local
# then edit .env.local and set AI_PROVIDER + the matching API key

# 3. Run the dev server
npm run dev
# open http://localhost:3000
```

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `AI_PROVIDER` | No (defaults to `gemini`) | `gemini` \| `openai` \| `anthropic` |
| `AI_MODEL` | No | Override the default model for the chosen provider |
| `GEMINI_API_KEY` | If using Gemini | From [Google AI Studio](https://aistudio.google.com/apikey) |
| `OPENAI_API_KEY` | If using OpenAI | From the OpenAI dashboard |
| `ANTHROPIC_API_KEY` | If using Anthropic | From the Anthropic Console |

Only the key matching `AI_PROVIDER` is required.

## Trying it out

Three ready-made sample CSVs are included under `sample-data/` to exercise different formats:

- `facebook-leads-export.csv` — Facebook Lead Ads style export (multiple emails in one field, phone with/without `+`)
- `google-ads-export.csv` — Google Ads style export (free-text status column, combined multi-phone field, possession-time note)
- `messy-manual-sheet.csv` — a manually created spreadsheet with vague headers (`Contact`, `Alt Contact`, `Mail`, `Where`), fully blank rows that must be skipped, and no consistent structure
- `large-test-300rows.csv` — a 300-row file to demonstrate the virtualized results table

All four are also served from `public/sample-data/` and are one click away from the app itself: the upload screen has a "Try a sample file" section with a button per file, so you can test the whole flow without leaving the browser.

## Running the tests

Unit tests (Vitest) cover the CSV escaping/export helpers and the AI-response sanitization logic (enum validation, date validation, skip-rule enforcement):

```bash
npm run test        # run once
npm run test:watch  # watch mode
```

## Deployment

### Vercel (recommended)
```bash
npm i -g vercel
vercel
```
Set the environment variables above in the Vercel project dashboard, then redeploy.

### Docker
```bash
docker build -t groweasy-csv-importer .
docker run -p 3000:3000 --env-file .env.local groweasy-csv-importer
```

## Project structure

```
app/
  page.tsx                 # 4-step import UI (upload → preview → confirm → result)
  layout.tsx
  globals.css
  api/
    parse-batch/route.ts   # POST endpoint: raw rows in, mapped CRM records out
components/
  FileUpload.tsx           # drag & drop CSV upload
  DataTable.tsx            # sticky-header, scrollable table (shared by preview & result)
  ProgressBar.tsx
  SummaryCards.tsx
  Stepper.tsx
  ThemeToggle.tsx          # dark mode
lib/
  ai.ts                    # provider abstraction + prompt engineering + validation
  csv.ts                   # CSV escaping/export + chunking + date validation
  types.ts                 # CRM schema, enums, API contracts
sample-data/               # sample CSVs in different formats for testing
```

## Notes on edge cases handled

- Rows with neither an email nor a mobile number are skipped, both by prompt instruction and by a hard server-side check.
- Extra emails/phone numbers beyond the first are preserved in `crm_note` instead of being discarded.
- `crm_status` and `data_source` are hard-validated against the allowed enum lists after the AI call; anything outside the list is coerced to `""` rather than silently accepted.
- `created_at` is validated with `new Date(value)` server-side; unparsable dates become `""`.
- Failed AI batches are retried automatically (up to 2 times) with backoff, and any batches that still fail are surfaced to the user with a manual "Retry failed batches" action, without losing already-completed results.
- The CSV export uses RFC 4180-safe escaping so commas, quotes, and newlines inside a field never break the output file.
- CSV files are parsed incrementally on the client (PapaParse `step` callback in a Web Worker) rather than in one blocking pass, so the tab stays responsive and a live row count is shown while large files are read.
- Both the preview and result tables automatically switch to a virtualized, windowed rendering mode above ~150 rows, so scrolling stays smooth even on files with thousands of rows.
Built with **Next.js 14 (App Router) + TypeScript + Tailwind CSS** on the frontend, and **Next.js API routes (Node.js)** on the backend, calling an LLM (Gemini / OpenAI / Anthropic — pluggable) to do the actual field mapping.

## Live demo & repo

- Hosted app: `<add your deployed URL here>`
- GitHub repo: `<add your repo URL here>`

## How it works

1. **Upload** — user drags/drops or picks a `.csv` file.
2. **Preview** — the file is parsed entirely client-side with PapaParse and shown in a sticky-header, scrollable table. **No AI call happens at this stage.**
3. **Confirm** — user clicks "Confirm & Import". Only now does the app talk to the backend.
4. **AI mapping** — the frontend splits rows into batches of 20 and sends each batch to `POST /api/parse-batch`, with up to 3 batches in flight concurrently and up to 2 automatic retries per failed batch. A progress bar tracks batches completed.
5. **Result** — a second table shows every row with an "Imported" / "Skipped" status, a live count of totals, a filter (All / Imported / Skipped), and a "Download CRM CSV" button that exports only the successfully imported rows in valid CSV.

## Why this architecture

- **Stateless & horizontally scalable** — the backend holds no session state; every batch request is self-contained (`headers`, `rows`, `startIndex`), so it can be deployed as serverless functions with no database required.
- **Batching on the client, not the server** — this keeps each request small (fast, well within LLM context/token limits, safe from platform request-size limits) and gives real, granular progress feedback and per-batch retry instead of an opaque single blocking call.
- **Provider-agnostic AI layer** (`lib/ai.ts`) — switch between Gemini, OpenAI, or Anthropic with one environment variable; no code changes needed.

## Prompt engineering approach

The system prompt (see `lib/ai.ts` → `buildSystemPrompt`) encodes every rule from the assignment directly, rather than relying on the model to infer them:

- The full target schema and field meanings are spelled out explicitly.
- Enum fields (`crm_status`, `data_source`) list their exact allowed values inline, with instructions to map by **intent** (e.g. "Not interested" → `BAD_LEAD`, "Deal closed" → `SALE_DONE`) and to fall back to `""` rather than inventing values.
- Multi-value fields (extra emails/phones) are explicitly folded into `crm_note` per the spec.
- The model is instructed to reason from **both header names and the actual data shape**, since headers alone are unreliable across Facebook/Google/manual exports.
- Output is constrained to a raw JSON array, same order as input, with a `skip`/`skipReason` flag per row — this keeps the batch atomic and order-preserving, which is what makes safe client-side re-assembly possible.
- The backend never trusts the model blindly: `sanitizeRow()` in `lib/ai.ts` re-validates every enum value, re-checks the date is parseable via `new Date(...)`, and **re-enforces the "must have email or mobile" skip rule server-side** even if the model forgets it.

## Getting started locally

```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables
cp .env.example .env.local
# then edit .env.local and set AI_PROVIDER + the matching API key

# 3. Run the dev server
npm run dev
# open http://localhost:3000
```

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `AI_PROVIDER` | No (defaults to `gemini`) | `gemini` \| `openai` \| `anthropic` |
| `AI_MODEL` | No | Override the default model for the chosen provider |
| `GEMINI_API_KEY` | If using Gemini | From [Google AI Studio](https://aistudio.google.com/apikey) |
| `OPENAI_API_KEY` | If using OpenAI | From the OpenAI dashboard |
| `ANTHROPIC_API_KEY` | If using Anthropic | From the Anthropic Console |

Only the key matching `AI_PROVIDER` is required.

## Trying it out

Three ready-made sample CSVs are included under `sample-data/` to exercise different formats:

- `facebook-leads-export.csv` — Facebook Lead Ads style export (multiple emails in one field, phone with/without `+`)
- `google-ads-export.csv` — Google Ads style export (free-text status column, combined multi-phone field, possession-time note)
- `messy-manual-sheet.csv` — a manually created spreadsheet with vague headers (`Contact`, `Alt Contact`, `Mail`, `Where`), fully blank rows that must be skipped, and no consistent structure

Upload any of these to see the mapping and skip logic in action.

## Deployment

### Vercel (recommended)
```bash
npm i -g vercel
vercel
```
Set the environment variables above in the Vercel project dashboard, then redeploy.

### Docker
```bash
docker build -t groweasy-csv-importer .
docker run -p 3000:3000 --env-file .env.local groweasy-csv-importer
```

## Project structure

```
app/
  page.tsx                 # 4-step import UI (upload → preview → confirm → result)
  layout.tsx
  globals.css
  api/
    parse-batch/route.ts   # POST endpoint: raw rows in, mapped CRM records out
components/
  FileUpload.tsx           # drag & drop CSV upload
  DataTable.tsx            # sticky-header, scrollable table (shared by preview & result)
  ProgressBar.tsx
  SummaryCards.tsx
  Stepper.tsx
  ThemeToggle.tsx          # dark mode
lib/
  ai.ts                    # provider abstraction + prompt engineering + validation
  csv.ts                   # CSV escaping/export + chunking + date validation
  types.ts                 # CRM schema, enums, API contracts
sample-data/               # sample CSVs in different formats for testing
```

## Notes on edge cases handled

- Rows with neither an email nor a mobile number are skipped, both by prompt instruction and by a hard server-side check.
- Extra emails/phone numbers beyond the first are preserved in `crm_note` instead of being discarded.
- `crm_status` and `data_source` are hard-validated against the allowed enum lists after the AI call; anything outside the list is coerced to `""` rather than silently accepted.
- `created_at` is validated with `new Date(value)` server-side; unparsable dates become `""`.
- Failed AI batches are retried automatically (up to 2 times) with backoff, and any batches that still fail are surfaced to the user with a manual "Retry failed batches" action, without losing already-completed results.
- The CSV export uses RFC 4180-safe escaping so commas, quotes, and newlines inside a field never break the output file.
