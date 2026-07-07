'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import clsx from 'clsx';

interface FileUploadProps {
  onFileAccepted: (file: File) => void;
  disabled?: boolean;
}

export default function FileUpload({ onFileAccepted, disabled }: FileUploadProps) {
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(
    (accepted: File[], rejected: any[]) => {
      setError(null);
      if (rejected.length > 0) {
        setError('Only .csv files are supported. Please choose a valid CSV file.');
        return;
      }
      const file = accepted[0];
      if (file) onFileAccepted(file);
    },
    [onFileAccepted]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    disabled,
    multiple: false,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.csv']
    }
  });

  return (
    <div>
      <div
        {...getRootProps()}
        className={clsx(
          'group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-16 text-center transition-colors',
          isDragActive
            ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10'
            : 'border-neutral-300 bg-white hover:border-brand-400 hover:bg-brand-50/40 dark:border-neutral-700 dark:bg-ink-800 dark:hover:bg-white/5',
          disabled && 'pointer-events-none opacity-60'
        )}
      >
        <input {...getInputProps()} />
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-brand-600 dark:bg-brand-500/20 dark:text-brand-400">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M12 16V4M12 4L7 9M12 4L17 9"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M4 16V17.5C4 18.8807 5.11929 20 6.5 20H17.5C18.8807 20 20 18.8807 20 17.5V16"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <p className="text-base font-semibold text-neutral-800 dark:text-neutral-100">
          {isDragActive ? 'Drop your CSV file here' : 'Drag & drop your CSV file here'}
        </p>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          or <span className="font-medium text-brand-600 dark:text-brand-400">click to browse</span>
        </p>
        <p className="mt-4 text-xs text-neutral-400 dark:text-neutral-500">
          Facebook leads, Google Ads exports, Excel sheets, real-estate CRM exports — any layout works.
        </p>
      </div>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
