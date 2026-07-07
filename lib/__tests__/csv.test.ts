import { describe, it, expect } from 'vitest';
import { escapeCsvField, recordsToCsv, chunk, isValidDateString } from '../csv';
import { CRMRecord } from '../types';

describe('escapeCsvField', () => {
  it('leaves plain values untouched', () => {
    expect(escapeCsvField('Mumbai')).toBe('Mumbai');
    expect(escapeCsvField(42)).toBe('42');
  });

  it('quotes values containing a comma', () => {
    expect(escapeCsvField('Deal closed, advance paid')).toBe('"Deal closed, advance paid"');
  });

  it('doubles internal quotes and wraps in quotes', () => {
    expect(escapeCsvField('Client said "call back"')).toBe('"Client said ""call back"""');
  });

  it('quotes values containing a newline', () => {
    expect(escapeCsvField('Line one\nLine two')).toBe('"Line one\nLine two"');
  });

  it('converts null/undefined to an empty string', () => {
    expect(escapeCsvField(null)).toBe('');
    expect(escapeCsvField(undefined)).toBe('');
  });
});

describe('recordsToCsv', () => {
  const baseRecord: CRMRecord = {
    created_at: '2026-05-13T14:20:48',
    name: 'John Doe',
    email: 'john.doe@example.com',
    country_code: '+91',
    mobile_without_country_code: '9876543210',
    company: 'GrowEasy',
    city: 'Mumbai',
    state: 'Maharashtra',
    country: 'India',
    lead_owner: 'test@gmail.com',
    crm_status: 'GOOD_LEAD_FOLLOW_UP',
    crm_note: '',
    data_source: '',
    possession_time: '',
    description: ''
  };

  it('produces a header row followed by one line per record', () => {
    const csv = recordsToCsv([baseRecord]);
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(
      'created_at,name,email,country_code,mobile_without_country_code,company,city,state,country,lead_owner,crm_status,crm_note,data_source,possession_time,description'
    );
    expect(lines[1]).toContain('John Doe');
    expect(lines[1]).toContain('GOOD_LEAD_FOLLOW_UP');
  });

  it('safely escapes a record containing commas and quotes in notes', () => {
    const record: CRMRecord = {
      ...baseRecord,
      crm_note: 'Said "call back", will decide next week'
    };
    const csv = recordsToCsv([record]);
    expect(csv).toContain('"Said ""call back"", will decide next week"');
  });

  it('returns just the header row for an empty record list', () => {
    const csv = recordsToCsv([]);
    expect(csv.split('\r\n')).toHaveLength(1);
  });
});

describe('chunk', () => {
  it('splits an array into fixed-size groups', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns a single chunk when size exceeds array length', () => {
    expect(chunk([1, 2], 10)).toEqual([[1, 2]]);
  });

  it('returns an empty array for an empty input', () => {
    expect(chunk([], 5)).toEqual([]);
  });
});

describe('isValidDateString', () => {
  it('accepts a valid ISO date string', () => {
    expect(isValidDateString('2026-05-13T14:20:48')).toBe(true);
  });

  it('accepts a valid common date format', () => {
    expect(isValidDateString('2026-05-13 14:20:48')).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(isValidDateString('')).toBe(false);
  });

  it('rejects an unparsable string', () => {
    expect(isValidDateString('not-a-date')).toBe(false);
  });
});