'use client';

import { useState } from 'react';

interface SampleFile {
  name: string;
  label: string;
  description: string;
  path: string;
}

const SAMPLE_FILES: SampleFile[] = [
  {
    name: 'facebook-leads-export.csv',
    label: 'Facebook Lead Ads export',
    description: 'Multiple emails in one field, phone numbers with/without "+"',
    path: '/sample-data/facebook-leads-export.csv'
  },
  {
    name: 'google-ads-export.csv',
    label: 'Google Ads export',
    description: 'Free-text status column, combined multi-phone field',
    path: '/sample-data/google-ads-export.csv'
  },
  {
    name: 'messy-manual-sheet.csv',
    label: 'Messy manual sheet',
    description: 'Vague headers, blank rows that should be skipped',
    path: '/sample-data/messy-manual-sheet.csv'
  }
];

interface SampleDataPickerProps {
  onFileLoaded: (file: File) => void;
  disabled?: boolean;
}

export default function SampleDataPicker({ onFileLoaded, disabled }: SampleDataPickerProps) {
  const [loadingName, setLoadingName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSample = async (sample: SampleFile) => {
    setError(null);
    setLoadingName(sample.name);
    try {
      const res = await fetch(sample.path);
      if (!res.ok) throw new Error(`Could not load ${sample.name} (${res.status})`);
      const blob = await res.blob();
      const file = new File([blob], sample.name, { type: 'text/csv' });
      onFileLoaded(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sample file.');
    } finally {
      setLoadingName(null);
    }
  };

  return (
    <div className="mt-6">
      <p className="mb-3 text-center text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        No CSV handy? Try a sample file
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {SAMPLE_FILES.map((sample) => (
          <button
            key={sample.name}
            type="button"
            disabled={disabled || loadingName !== null}
            onClick={() => loadSample(sample)}
            className="flex flex-col items-start gap-1 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-left shadow-soft transition-colors hover:border-brand-400 hover:bg-brand-50/40 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-ink-800 dark:hover:bg-white/5"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-neutral-800 dark:text-neutral-100">
              {loadingName === sample.name ? (
                <span className="h-3.5 w-3.5 flex-none animate-spin rounded-full border-2 border-brand-200 border-t-brand-500" />
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="flex-none text-brand-500">
                  <path
                    d="M6 2h9l5 5v13a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                  <path d="M15 2v5h5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                </svg>
              )}
              {sample.label}
            </span>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">{sample.description}</span>
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-center text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}