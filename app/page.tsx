'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import FileUpload from '@/components/FileUpload';
import SampleDataPicker from '@/components/SampleDataPicker';
import DataTable, { Column } from '@/components/DataTable';
import Stepper from '@/components/Stepper';
import ProgressBar from '@/components/ProgressBar';
import SummaryCards from '@/components/SummaryCards';
import ThemeToggle from '@/components/ThemeToggle';
import { chunk, recordsToCsv } from '@/lib/csv';
import { CRM_FIELDS, CRMRecord, ExtractedRow, RawRow } from '@/lib/types';

type Step = 'upload' | 'preview' | 'processing' | 'result';

const BATCH_SIZE = 20;
const MAX_CONCURRENT_BATCHES = 3;
const MAX_RETRIES_PER_BATCH = 2;

interface ResultRow extends ExtractedRow {
  batchIndex: number;
}

export default function HomePage() {
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState<string>('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedRowCount, setParsedRowCount] = useState(0);

  const [batchesDone, setBatchesDone] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [failedBatchIndexes, setFailedBatchIndexes] = useState<number[]>([]);

  const [results, setResults] = useState<ResultRow[]>([]);
  const [resultFilter, setResultFilter] = useState<'all' | 'imported' | 'skipped'>('all');

  const batchesRef = useRef<RawRow[][]>([]);

  const stepIndex = { upload: 0, preview: 1, processing: 2, result: 3 }[step];

  const resetAll = () => {
    setStep('upload');
    setFileName('');
    setHeaders([]);
    setRawRows([]);
    setParseError(null);
    setIsParsing(false);
    setParsedRowCount(0);
    setBatchesDone(0);
    setTotalBatches(0);
    setProcessingError(null);
    setFailedBatchIndexes([]);
    setResults([]);
    setResultFilter('all');
  };

  const handleFileAccepted = useCallback((file: File) => {
    setParseError(null);
    setFileName(file.name);
    setIsParsing(true);
    setParsedRowCount(0);

    // Parsed incrementally via PapaParse's `step` callback rather than
    // waiting for a single `complete` result: the file is read and parsed
    // in chunks, rows accumulate as they arrive, and the UI reflects a live
    // row count. This keeps the tab responsive and gives real progress
    // feedback on large files instead of one long blocking parse.
    const collected: RawRow[] = [];
    let detectedFields: string[] = [];

    Papa.parse<RawRow>(file, {
      header: true,
      skipEmptyLines: true,
      worker: true,
      step: (result) => {
        if (detectedFields.length === 0 && result.meta.fields) {
          detectedFields = result.meta.fields;
        }
        collected.push(result.data);
        if (collected.length % 100 === 0) {
          setParsedRowCount(collected.length);
        }
      },
      complete: () => {
        setIsParsing(false);
        if (collected.length === 0) {
          setParseError('The CSV file appears to be empty or could not be parsed.');
          return;
        }
        const cols = detectedFields.length > 0 ? detectedFields : Object.keys(collected[0] || {});
        if (cols.length === 0) {
          setParseError('Could not detect any columns in this CSV.');
          return;
        }
        setHeaders(cols);
        setRawRows(collected);
        setParsedRowCount(collected.length);
        setStep('preview');
      },
      error: (err) => {
        setIsParsing(false);
        setParseError(`Failed to parse CSV: ${err.message}`);
      }
    });
  }, []);

  const runBatch = async (batch: RawRow[], startIndex: number, batchIdx: number, attempt = 0): Promise<ExtractedRow[]> => {
    try {
      const res = await fetch('/api/parse-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headers, rows: batch, startIndex })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Batch ${batchIdx + 1} failed.`);
      return data.results as ExtractedRow[];
    } catch (err) {
      if (attempt < MAX_RETRIES_PER_BATCH) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        return runBatch(batch, startIndex, batchIdx, attempt + 1);
      }
      setFailedBatchIndexes((prev) => [...prev, batchIdx]);
      throw err;
    }
  };

  const startProcessing = async () => {
    setStep('processing');
    setProcessingError(null);
    setFailedBatchIndexes([]);
    setResults([]);

    const batches = chunk(rawRows, BATCH_SIZE);
    batchesRef.current = batches;
    setTotalBatches(batches.length);
    setBatchesDone(0);

    const allResults: ResultRow[] = [];
    let queueIndex = 0;
    let anyError: string | null = null;

    async function worker() {
      while (queueIndex < batches.length) {
        const myIndex = queueIndex++;
        const batch = batches[myIndex];
        const startIndex = myIndex * BATCH_SIZE;
        try {
          const res = await runBatch(batch, startIndex, myIndex);
          res.forEach((r) => allResults.push({ ...r, batchIndex: myIndex }));
        } catch (err) {
          anyError = err instanceof Error ? err.message : 'Unknown processing error.';
        } finally {
          setBatchesDone((d) => d + 1);
        }
      }
    }

    const workers = Array.from({ length: Math.min(MAX_CONCURRENT_BATCHES, batches.length) }, () => worker());
    await Promise.all(workers);

    // Give React a chance to paint the final progress state (e.g. 100%)
    // before switching screens - otherwise a fast single-batch run can
    // finish and transition in the same tick, so the bar never visibly moves.
    await new Promise((r) => setTimeout(r, 400));

    allResults.sort((a, b) => a.sourceIndex - b.sourceIndex);
    setResults(allResults);
    if (anyError) setProcessingError(anyError);
    setStep('result');
  };

  const retryFailedBatches = async () => {
    if (failedBatchIndexes.length === 0) return;
    setStep('processing');
    setProcessingError(null);
    const toRetry = [...failedBatchIndexes];
    setFailedBatchIndexes([]);
    setBatchesDone(totalBatches - toRetry.length);

    const recovered: ResultRow[] = [];
    let anyError: string | null = null;

    for (const idx of toRetry) {
      const batch = batchesRef.current[idx];
      const startIndex = idx * BATCH_SIZE;
      try {
        const res = await runBatch(batch, startIndex, idx);
        res.forEach((r) => recovered.push({ ...r, batchIndex: idx }));
      } catch (err) {
        anyError = err instanceof Error ? err.message : 'Unknown processing error.';
      } finally {
        setBatchesDone((d) => d + 1);
      }
    }

    await new Promise((r) => setTimeout(r, 400));

    setResults((prev) => {
      const merged = [...prev.filter((r) => !toRetry.includes(r.batchIndex)), ...recovered];
      merged.sort((a, b) => a.sourceIndex - b.sourceIndex);
      return merged;
    });
    if (anyError) setProcessingError(anyError);
    setStep('result');
  };

  const previewColumns: Column[] = useMemo(
    () => headers.map((h) => ({ key: h, label: h })),
    [headers]
  );

  const summary = useMemo(() => {
    const totalImported = results.filter((r) => !r.skipped).length;
    const totalSkipped = results.filter((r) => r.skipped).length;
    return { totalInput: rawRows.length, totalImported, totalSkipped };
  }, [results, rawRows.length]);

  const resultColumns: Column[] = useMemo(
    () => [
      { key: 'status', label: 'Status', width: '8rem' },
      ...CRM_FIELDS.map((f) => ({ key: f, label: f }))
    ],
    []
  );

  const resultTableRows = useMemo(() => {
    const filtered = results.filter((r) => {
      if (resultFilter === 'imported') return !r.skipped;
      if (resultFilter === 'skipped') return r.skipped;
      return true;
    });
    return filtered.map((r) => ({
      sourceIndex: r.sourceIndex,
      status: r.skipped ? `Skipped` : 'Imported',
      _skipped: r.skipped,
      _skipReason: r.skipReason,
      ...(r.record || Object.fromEntries(CRM_FIELDS.map((f) => [f, ''])))
    }));
  }, [results, resultFilter]);

  const downloadCsv = () => {
    const records = results.filter((r): r is ResultRow & { record: CRMRecord } => !r.skipped && !!r.record).map((r) => r.record);
    const csv = recordsToCsv(records);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'groweasy-crm-import.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-900 text-white dark:bg-brand-500">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M4 17L10 11L14 15L20 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M14 7H20V13" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-neutral-900 dark:text-white">GrowEasy CSV Importer</h1>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">AI-mapped lead import for any CSV layout</p>
          </div>
        </div>
        <ThemeToggle />
      </header>

      <div className="mb-8 overflow-x-auto rounded-2xl border border-neutral-200 bg-white px-5 py-4 shadow-soft dark:border-neutral-800 dark:bg-ink-800">
        <Stepper activeIndex={stepIndex} />
      </div>

      {step === 'upload' && (
        <section className="animate-fadeIn">
          <FileUpload onFileAccepted={handleFileAccepted} disabled={isParsing} />
          {isParsing && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-brand-50 px-4 py-2 text-sm text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
              <span className="h-3.5 w-3.5 flex-none animate-spin rounded-full border-2 border-brand-300 border-t-brand-600" />
              Parsing file… {parsedRowCount.toLocaleString()} rows read so far
            </div>
          )}
          {parseError && (
            <p className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
              {parseError}
            </p>
          )}
          <SampleDataPicker onFileLoaded={handleFileAccepted} disabled={isParsing} />
        </section>
      )}

      {step === 'preview' && (
        <section className="animate-fadeIn space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-neutral-800 dark:text-neutral-100">{fileName}</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {rawRows.length} rows · {headers.length} columns detected · no AI processing yet
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={resetAll}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-white/5"
              >
                Choose a different file
              </button>
              <button
                onClick={startProcessing}
                className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-brand-600"
              >
                Confirm &amp; Import
              </button>
            </div>
          </div>
          <DataTable
            columns={previewColumns}
            rows={rawRows}
            rowKey={(_, i) => i}
            maxHeight="32rem"
          />
        </section>
      )}

      {step === 'processing' && (
        <section className="animate-fadeIn flex flex-col items-center justify-center gap-6 rounded-2xl border border-neutral-200 bg-white px-8 py-16 shadow-soft dark:border-neutral-800 dark:bg-ink-800">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-500" />
          <div className="w-full max-w-md">
            <ProgressBar current={batchesDone} total={totalBatches} />
          </div>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Mapping {rawRows.length} rows into GrowEasy CRM format using AI, in batches of {BATCH_SIZE}...
          </p>
        </section>
      )}

      {step === 'result' && (
        <section className="animate-fadeIn space-y-5">
          {processingError && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
              <span>
                {processingError} {failedBatchIndexes.length > 0 && `(${failedBatchIndexes.length} batch(es) failed)`}
              </span>
              {failedBatchIndexes.length > 0 && (
                <button
                  onClick={retryFailedBatches}
                  className="rounded-md border border-red-300 px-3 py-1 font-medium hover:bg-red-100 dark:border-red-400/40 dark:hover:bg-red-500/10"
                >
                  Retry failed batches
                </button>
              )}
            </div>
          )}

          <SummaryCards {...summary} />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1 rounded-lg border border-neutral-200 bg-white p-1 text-sm dark:border-neutral-800 dark:bg-ink-800">
              {(['all', 'imported', 'skipped'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setResultFilter(f)}
                  className={`rounded-md px-3 py-1.5 font-medium capitalize transition-colors ${
                    resultFilter === f
                      ? 'bg-brand-500 text-white'
                      : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-white/5'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={resetAll}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-white/5"
              >
                Import another file
              </button>
              <button
                onClick={downloadCsv}
                disabled={summary.totalImported === 0}
                className="rounded-lg bg-ink-900 px-4 py-2 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-brand-500 dark:hover:bg-brand-600"
              >
                Download CRM CSV
              </button>
            </div>
          </div>

          <DataTable
            columns={resultColumns}
            rows={resultTableRows}
            rowKey={(r) => r.sourceIndex}
            maxHeight="32rem"
            rowClassName={(r) => (r._skipped ? 'bg-red-50/60 dark:bg-red-500/5' : '')}
          />
        </section>
      )}
    </main>
  );
}