'use client';

import clsx from 'clsx';

interface SummaryCardsProps {
  totalInput: number;
  totalImported: number;
  totalSkipped: number;
}

function Card({
  label,
  value,
  tone
}: {
  label: string;
  value: number;
  tone: 'neutral' | 'good' | 'bad';
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-soft dark:border-neutral-800 dark:bg-ink-800">
      <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">{label}</p>
      <p
        className={clsx(
          'mt-1 text-3xl font-semibold tabular-nums',
          tone === 'good' && 'text-emerald-600 dark:text-emerald-400',
          tone === 'bad' && 'text-red-600 dark:text-red-400',
          tone === 'neutral' && 'text-neutral-900 dark:text-neutral-50'
        )}
      >
        {value.toLocaleString()}
      </p>
    </div>
  );
}

export default function SummaryCards({ totalInput, totalImported, totalSkipped }: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Card label="Total rows in file" value={totalInput} tone="neutral" />
      <Card label="Successfully imported" value={totalImported} tone="good" />
      <Card label="Skipped records" value={totalSkipped} tone="bad" />
    </div>
  );
}
