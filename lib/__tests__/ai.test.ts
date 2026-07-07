import { describe, it, expect } from 'vitest';
import { sanitizeRow } from '../ai';

const validBase = {
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
  data_source: 'leads_on_demand',
  possession_time: '',
  description: '',
  skip: false,
  skipReason: ''
};

describe('sanitizeRow', () => {
  it('passes through a fully valid row unchanged', () => {
    const { record, skip } = sanitizeRow({ ...validBase });
    expect(skip).toBe(false);
    expect(record.name).toBe('John Doe');
    expect(record.crm_status).toBe('GOOD_LEAD_FOLLOW_UP');
    expect(record.data_source).toBe('leads_on_demand');
  });

  it('coerces an invalid crm_status to an empty string', () => {
    const { record } = sanitizeRow({ ...validBase, crm_status: 'MAYBE_INTERESTED' });
    expect(record.crm_status).toBe('');
  });

  it('coerces an invalid data_source to an empty string', () => {
    const { record } = sanitizeRow({ ...validBase, data_source: 'some_random_project' });
    expect(record.data_source).toBe('');
  });

  it('coerces an unparsable created_at to an empty string', () => {
    const { record } = sanitizeRow({ ...validBase, created_at: 'not-a-real-date' });
    expect(record.created_at).toBe('');
  });

  it('keeps a valid created_at date', () => {
    const { record } = sanitizeRow({ ...validBase, created_at: '2026-06-01 09:12:00' });
    expect(record.created_at).toBe('2026-06-01 09:12:00');
  });

  it('skips a row with neither email nor mobile, even if the model forgot to flag it', () => {
    const { skip, skipReason } = sanitizeRow({
      ...validBase,
      email: '',
      mobile_without_country_code: '',
      skip: false
    });
    expect(skip).toBe(true);
    expect(skipReason).toMatch(/no email or mobile/i);
  });

  it('keeps a row that has only a mobile number and no email', () => {
    const { skip } = sanitizeRow({ ...validBase, email: '' });
    expect(skip).toBe(false);
  });

  it('keeps a row that has only an email and no mobile number', () => {
    const { skip } = sanitizeRow({ ...validBase, mobile_without_country_code: '' });
    expect(skip).toBe(false);
  });

  it('respects an explicit skip flag from the model when contact info is otherwise present', () => {
    const { skip, skipReason } = sanitizeRow({
      ...validBase,
      skip: true,
      skipReason: 'Duplicate test entry'
    });
    expect(skip).toBe(true);
    expect(skipReason).toBe('Duplicate test entry');
  });

  it('trims whitespace from string fields', () => {
    const { record } = sanitizeRow({ ...validBase, name: '  Jane Doe  ' });
    expect(record.name).toBe('Jane Doe');
  });
});