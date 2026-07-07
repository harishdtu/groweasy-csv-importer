'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';

export interface Column {
  key: string;
  label: string;
  width?: string;
  render?: (value: any, row: Record<string, any>) => React.ReactNode;
}

interface DataTableProps {
  columns: Column[];
  rows: Record<string, any>[];
  rowKey: (row: Record<string, any>, index: number) => string | number;
  maxHeight?: string;
  emptyLabel?: string;
  rowClassName?: (row: Record<string, any>) => string;
}

/** Above this row count we switch from a plain HTML table to a virtualized grid. */
const VIRTUALIZE_THRESHOLD = 150;
const ROW_HEIGHT = 40;
const OVERSCAN = 8;

function toPx(width: string | undefined): string {
  if (!width) return '180px';
  // Column widths are authored as rem (e.g. "9rem"); convert for a fixed grid track.
  const remMatch = /^([\d.]+)rem$/.exec(width);
  if (remMatch) return `${parseFloat(remMatch[1]) * 16}px`;
  return width;
}

export default function DataTable({
  columns,
  rows,
  rowKey,
  maxHeight = '28rem',
  emptyLabel = 'No rows to display.',
  rowClassName
}: DataTableProps) {
  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-dashed border-neutral-300 py-12 text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
        {emptyLabel}
      </div>
    );
  }

  if (rows.length > VIRTUALIZE_THRESHOLD) {
    return (
      <VirtualizedTable
        columns={columns}
        rows={rows}
        rowKey={rowKey}
        maxHeight={maxHeight}
        rowClassName={rowClassName}
      />
    );
  }

  return (
    <div
      className="relative overflow-auto rounded-xl border border-neutral-200 shadow-soft dark:border-neutral-800"
      style={{ maxHeight }}
    >
      <table className="w-full min-w-max border-collapse text-left text-sm">
        <thead className="sticky top-0 z-10 bg-neutral-100/95 backdrop-blur dark:bg-ink-700/95">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className="whitespace-nowrap border-b border-neutral-200 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
                style={{ minWidth: col.width || '9rem' }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={rowKey(row, i)}
              className={clsx(
                'border-b border-neutral-100 transition-colors last:border-0 hover:bg-brand-50/60 dark:border-neutral-800 dark:hover:bg-white/5',
                rowClassName?.(row)
              )}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className="whitespace-nowrap px-4 py-2.5 text-neutral-700 dark:text-neutral-200"
                >
                  {col.render ? col.render(row[col.key], row) : row[col.key] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Renders only the rows currently in (or near) the visible scroll window.
 * Uses a CSS grid instead of a real <table> since absolutely-positioned rows
 * can't live inside <tbody> - the grid keeps column alignment between the
 * sticky header and the windowed rows.
 */
function VirtualizedTable({
  columns,
  rows,
  rowKey,
  maxHeight,
  rowClassName
}: Omit<DataTableProps, 'emptyLabel'>) {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(400);

  const gridTemplateColumns = useMemo(
    () => columns.map((c) => toPx(c.width)).join(' '),
    [columns]
  );

  const totalHeight = rows.length * ROW_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2;
  const endIndex = Math.min(rows.length, startIndex + visibleCount);
  const visibleRows = rows.slice(startIndex, endIndex);

  return (
    <div
      className="relative overflow-auto rounded-xl border border-neutral-200 shadow-soft dark:border-neutral-800"
      style={{ maxHeight }}
      ref={(el) => {
        if (el && viewportHeight !== el.clientHeight && el.clientHeight > 0) {
          setViewportHeight(el.clientHeight);
        }
      }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ minWidth: 'max-content' }}>
        <div
          className="sticky top-0 z-10 grid bg-neutral-100/95 backdrop-blur dark:bg-ink-700/95"
          style={{ gridTemplateColumns }}
        >
          {columns.map((col) => (
            <div
              key={col.key}
              className="whitespace-nowrap border-b border-neutral-200 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
            >
              {col.label}
            </div>
          ))}
        </div>
        <div style={{ height: totalHeight, position: 'relative' }}>
          {visibleRows.map((row, i) => {
            const absoluteIndex = startIndex + i;
            return (
              <div
                key={rowKey(row, absoluteIndex)}
                className={clsx(
                  'grid border-b border-neutral-100 transition-colors hover:bg-brand-50/60 dark:border-neutral-800 dark:hover:bg-white/5',
                  rowClassName?.(row)
                )}
                style={{
                  gridTemplateColumns,
                  position: 'absolute',
                  top: absoluteIndex * ROW_HEIGHT,
                  left: 0,
                  right: 0,
                  height: ROW_HEIGHT
                }}
              >
                {columns.map((col) => (
                  <div
                    key={col.key}
                    className="flex items-center overflow-hidden text-ellipsis whitespace-nowrap px-4 text-sm text-neutral-700 dark:text-neutral-200"
                  >
                    {col.render ? col.render(row[col.key], row) : row[col.key] ?? ''}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <p className="sticky bottom-0 left-0 border-t border-neutral-200 bg-neutral-50/95 px-4 py-1.5 text-xs text-neutral-500 backdrop-blur dark:border-neutral-800 dark:bg-ink-800/95 dark:text-neutral-400">
        Showing rows {startIndex + 1}-{endIndex} of {rows.length.toLocaleString()} (virtualized for performance)
      </p>
    </div>
  );
}