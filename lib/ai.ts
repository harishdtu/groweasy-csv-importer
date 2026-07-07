import {
  CRM_FIELDS,
  CRM_STATUS_VALUES,
  DATA_SOURCE_VALUES,
  CRMRecord,
  ExtractedRow,
  RawRow
} from './types';
import { isValidDateString } from './csv';

type Provider = 'gemini' | 'openai' | 'anthropic';

function getProvider(): Provider {
  const p = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
  if (p === 'gemini' || p === 'openai' || p === 'anthropic') return p;
  return 'gemini';
}

/**
 * The single source of truth for how the model should map arbitrary,
 * unpredictable CSV columns onto the fixed GrowEasy CRM schema. Every rule
 * here comes directly from the assignment's "AI Instructions" section.
 */
function buildSystemPrompt(): string {
  return `You are a meticulous data-mapping engine for a CRM lead importer. You receive rows from CSV files that can come from ANY source (Facebook Lead Ads exports, Google Ads exports, Excel sheets, real-estate CRM exports, sales reports, marketing agency sheets, or manually created spreadsheets). Column names, order, and structure are NEVER fixed or guaranteed. Your job is to intelligently identify which column(s) correspond to which CRM field, using column names, sample values, and context - not exact string matches.

TARGET SCHEMA (return exactly these keys for every record, using "" for anything you cannot determine):
- created_at: lead creation date/time
- name: lead's full name
- email: primary email address
- country_code: phone country code, formatted like "+91"
- mobile_without_country_code: phone number WITHOUT the country code
- company: company / organization name
- city, state, country: location fields
- lead_owner: the salesperson / agent assigned to the lead (often an email or name)
- crm_status: MUST be exactly one of ${CRM_STATUS_VALUES.join(', ')}, or "" if nothing maps confidently
- crm_note: remarks, follow-up notes, extra comments, extra phone numbers, extra emails, or any useful info that doesn't fit elsewhere
- data_source: MUST be exactly one of ${DATA_SOURCE_VALUES.join(', ')}, or "" if none match confidently. Never invent a value outside this list.
- possession_time: property possession timeframe, if present (real-estate leads)
- description: any additional free-text description

MAPPING RULES:
1. Infer field meaning from header names AND from the actual data pattern (e.g. a column of values like "9876543210" next to a column of "+91" is a phone pair even if headers are odd like "Phone" and "Code" or "Mobile1"/"STD").
2. If multiple email addresses exist for one lead, use the first as "email" and append the rest into "crm_note" (e.g. "Additional email: x@y.com").
3. If multiple mobile numbers exist for one lead, use the first as "mobile_without_country_code" and append the rest into "crm_note".
4. If a phone number already includes a country code prefix (e.g. "+919876543210" or "0091..."), split it correctly into country_code and mobile_without_country_code.
5. crm_status: map free-text statuses to the closest allowed enum using intent (e.g. "Not interested" -> BAD_LEAD, "Deal closed"/"Won"/"Converted" -> SALE_DONE, "Could not reach"/"No answer"/"Busy" -> DID_NOT_CONNECT, "Interested"/"Follow up"/"Callback requested" -> GOOD_LEAD_FOLLOW_UP). If truly ambiguous, use "".
6. data_source: only choose one of the allowed values if the row gives a clear, confident signal (e.g. a project/campaign name literally matching one of the allowed values, or an obvious alias). Otherwise leave it "".
7. created_at: normalize to an ISO 8601 string (e.g. "2026-05-13T14:20:48") or any format that JavaScript's "new Date(value)" can parse successfully. If no date is present, use "".
8. Never fabricate data that is not present or reasonably inferable from the row. Missing information becomes "".
9. Preserve useful information you can't otherwise place by appending short notes into crm_note (pipe-separated if multiple), rather than discarding it.
10. skip: set "skip": true with a short "skipReason" ONLY when the row contains NEITHER a usable email NOR a usable mobile number. Otherwise "skip": false and "skipReason": "".

OUTPUT FORMAT (critical):
Return ONLY a raw JSON array, one object per INPUT row, in the exact same order as the input rows, with NO markdown fences, NO commentary, and NO text before or after the JSON. Each object must have exactly these keys: ${CRM_FIELDS.join(', ')}, skip, skipReason.`;
}

function buildUserPrompt(headers: string[], rows: RawRow[]): string {
  const rowsJson = JSON.stringify(rows, null, 0);
  return `CSV column headers (in original order): ${JSON.stringify(headers)}

Rows to map (JSON array, ${rows.length} rows total). Map EVERY row and return them in the SAME order:
${rowsJson}`;
}

/** Strips accidental markdown code fences some models add despite instructions. */
function stripFences(text: string): string {
  return text
    .trim()
    .replace(/^```(json)?/i, '')
    .replace(/```$/i, '')
    .trim();
}

interface RawModelRow {
  [key: string]: unknown;
  skip?: boolean;
  skipReason?: string;
}

async function callGemini(system: string, user: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured on the server.');
  const model = process.env.AI_MODEL || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json'
      }
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${errText.slice(0, 500)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '';
  return text;
}

async function callOpenAI(system: string, user: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured on the server.');
  const model = process.env.AI_MODEL || 'openai/gpt-4o-mini';

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
      'X-Title': 'GrowEasy CSV Importer'
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter API error (${res.status}): ${errText.slice(0, 500)}`);
  }
  const data = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? '[]';
  return content;
}

async function callAnthropic(system: string, user: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured on the server.');
  const model = process.env.AI_MODEL || 'claude-sonnet-4-6';

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      temperature: 0,
      system,
      messages: [{ role: 'user', content: user }]
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${errText.slice(0, 500)}`);
  }
  const data = await res.json();
  const text = data?.content?.map((b: any) => (b.type === 'text' ? b.text : '')).join('') ?? '';
  return text;
}

async function callModel(system: string, user: string): Promise<string> {
  const provider = getProvider();
  if (provider === 'openai') return callOpenAI(system, user);
  if (provider === 'anthropic') return callAnthropic(system, user);
  return callGemini(system, user);
}

/** Coerces and validates a single model-produced row into a safe CRMRecord + skip flag. */
export function sanitizeRow(raw: RawModelRow): { record: CRMRecord; skip: boolean; skipReason?: string } {
  const get = (key: string): string => {
    const v = raw[key];
    return typeof v === 'string' ? v.trim() : v === null || v === undefined ? '' : String(v).trim();
  };

  let crm_status = get('crm_status');
  if (crm_status && !(CRM_STATUS_VALUES as readonly string[]).includes(crm_status)) {
    crm_status = '';
  }

  let data_source = get('data_source');
  if (data_source && !(DATA_SOURCE_VALUES as readonly string[]).includes(data_source)) {
    data_source = '';
  }

  let created_at = get('created_at');
  if (created_at && !isValidDateString(created_at)) {
    created_at = '';
  }

  const record: CRMRecord = {
    created_at,
    name: get('name'),
    email: get('email'),
    country_code: get('country_code'),
    mobile_without_country_code: get('mobile_without_country_code'),
    company: get('company'),
    city: get('city'),
    state: get('state'),
    country: get('country'),
    lead_owner: get('lead_owner'),
    crm_status: crm_status as CRMRecord['crm_status'],
    crm_note: get('crm_note'),
    data_source: data_source as CRMRecord['data_source'],
    possession_time: get('possession_time'),
    description: get('description')
  };

  // Server-side safety net: enforce the "must have email or mobile" rule
  // even if the model forgot to flag it.
  const hasEmail = record.email.length > 0;
  const hasMobile = record.mobile_without_country_code.length > 0;
  const modelSkip = raw.skip === true;

  if (!hasEmail && !hasMobile) {
    return { record, skip: true, skipReason: 'No email or mobile number present' };
  }
  if (modelSkip) {
    return { record, skip: true, skipReason: typeof raw.skipReason === 'string' ? raw.skipReason : 'Skipped by model' };
  }
  return { record, skip: false };
}

/**
 * Sends one batch of raw CSV rows to the configured AI provider and returns
 * validated, schema-safe results in the same order as the input.
 * Retries once on transient failure or malformed output before giving up.
 */
export async function extractBatch(
  headers: string[],
  rows: RawRow[],
  startIndex: number,
  maxRetries = 2
): Promise<ExtractedRow[]> {
  const system = buildSystemPrompt();
  const user = buildUserPrompt(headers, rows);

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const raw = await callModel(system, user);
      const cleaned = stripFences(raw);
      const parsed = JSON.parse(cleaned) as RawModelRow[];

      if (!Array.isArray(parsed) || parsed.length !== rows.length) {
        throw new Error(
          `Model returned ${Array.isArray(parsed) ? parsed.length : 'non-array'} results for ${rows.length} input rows.`
        );
      }

      return parsed.map((raw, i) => {
        const { record, skip, skipReason } = sanitizeRow(raw);
        return {
          sourceIndex: startIndex + i,
          record: skip ? null : record,
          skipped: skip,
          skipReason
        };
      });
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('AI extraction failed after retries.');
}

export function getProviderInfo(): { provider: Provider; model: string } {
  const provider = getProvider();
  const defaults: Record<Provider, string> = {
    gemini: 'gemini-2.0-flash',
    openai: 'gpt-4o-mini',
    anthropic: 'claude-sonnet-4-6'
  };
  return { provider, model: process.env.AI_MODEL || defaults[provider] };
}