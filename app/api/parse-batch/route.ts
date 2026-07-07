import { NextRequest, NextResponse } from 'next/server';
import { extractBatch, getProviderInfo } from '@/lib/ai';
import { ParseBatchRequest, ParseBatchResponse } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_ROWS_PER_BATCH = 40;

export async function POST(req: NextRequest) {
  let body: ParseBatchRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { headers, rows, startIndex } = body || ({} as ParseBatchRequest);

  if (!Array.isArray(headers) || headers.length === 0) {
    return NextResponse.json({ error: 'Missing or invalid "headers" array.' }, { status: 400 });
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'Missing or invalid "rows" array.' }, { status: 400 });
  }
  if (rows.length > MAX_ROWS_PER_BATCH) {
    return NextResponse.json(
      { error: `Batch too large. Max ${MAX_ROWS_PER_BATCH} rows per request, got ${rows.length}.` },
      { status: 400 }
    );
  }
  if (typeof startIndex !== 'number' || startIndex < 0) {
    return NextResponse.json({ error: 'Missing or invalid "startIndex".' }, { status: 400 });
  }

  try {
    const results = await extractBatch(headers, rows, startIndex);
    const { provider, model } = getProviderInfo();
    const payload: ParseBatchResponse = { results, provider, model };
    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error during AI extraction.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
