import { CRM_FIELDS, CRMRecord } from './types';

/**
 * Escapes a single CSV field per RFC 4180: wraps in quotes if it contains a
 * comma, quote, or newline, and doubles any internal quotes. Newlines inside
 * a field are preserved (allowed inside quoted fields) rather than stripped,
 * matching the assignment's "escape appropriately" requirement.
 */
export function escapeCsvField(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Converts an array of CRM records into a single valid CSV string. */
export function recordsToCsv(records: CRMRecord[]): string {
  const header = CRM_FIELDS.join(',');
  const lines = records.map((record) =>
    CRM_FIELDS.map((field) => escapeCsvField(record[field])).join(',')
  );
  return [header, ...lines].join('\r\n');
}

/** Splits an array into fixed-size chunks, preserving order. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/** True if a JS Date can be constructed from the string without producing "Invalid Date". */
export function isValidDateString(value: string): boolean {
  if (!value) return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}
