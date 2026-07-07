'use client';

import clsx from 'clsx';

const STEPS = ['Upload', 'Preview', 'Confirm', 'Result'];

export default function Stepper({ activeIndex }: { activeIndex: number }) {
  return (
    <ol className="flex items-center gap-2 sm:gap-4">
      {STEPS.map((step, i) => {
        const state = i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'upcoming';
        return (
          <li key={step} className="flex items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-2">
              <span
                className={clsx(
                  'flex h-7 w-7 flex-none items-center justify-center rounded-full text-xs font-semibold transition-colors',
                  state === 'done' && 'bg-brand-500 text-white',
                  state === 'active' && 'bg-brand-100 text-brand-700 ring-2 ring-brand-500 dark:bg-brand-500/20 dark:text-brand-300',
                  state === 'upcoming' && 'bg-neutral-200 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-500'
                )}
              >
                {state === 'done' ? '✓' : i + 1}
              </span>
              <span
                className={clsx(
                  'hidden text-sm font-medium sm:inline',
                  state === 'upcoming'
                    ? 'text-neutral-400 dark:text-neutral-500'
                    : 'text-neutral-800 dark:text-neutral-100'
                )}
              >
                {step}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <span className="h-px w-4 flex-none bg-neutral-300 sm:w-10 dark:bg-neutral-700" />
            )}
          </li>
        );
      })}
    </ol>
  );
}
