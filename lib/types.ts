export const CRM_STATUS_VALUES = [
  'GOOD_LEAD_FOLLOW_UP',
  'DID_NOT_CONNECT',
  'BAD_LEAD',
  'SALE_DONE'
] as const;

export type CrmStatus = (typeof CRM_STATUS_VALUES)[number] | '';

export const DATA_SOURCE_VALUES = [
  'leads_on_demand',
  'meridian_tower',
  'eden_park',
  'varah_swamy',
  'sarjapur_plots'
] as const;

export type DataSource = (typeof DATA_SOURCE_VALUES)[number] | '';

export interface CRMRecord {
  created_at: string;
  name: string;
  email: string;
  country_code: string;
  mobile_without_country_code: string;
  company: string;
  city: string;
  state: string;
  country: string;
  lead_owner: string;
  crm_status: CrmStatus;
  crm_note: string;
  data_source: DataSource;
  possession_time: string;
  description: string;
}

export const CRM_FIELDS: (keyof CRMRecord)[] = [
  'created_at',
  'name',
  'email',
  'country_code',
  'mobile_without_country_code',
  'company',
  'city',
  'state',
  'country',
  'lead_owner',
  'crm_status',
  'crm_note',
  'data_source',
  'possession_time',
  'description'
];

/** A single row exactly as parsed from the uploaded CSV (raw, untouched). */
export type RawRow = Record<string, string>;

/** Result of processing a single row through the AI extractor. */
export interface ExtractedRow {
  /** Original row index within the full uploaded file (0-based). */
  sourceIndex: number;
  record: CRMRecord | null;
  skipped: boolean;
  skipReason?: string;
}

export interface ParseBatchRequest {
  headers: string[];
  rows: RawRow[];
  /** 0-based index of the first row in this batch, relative to the whole file. */
  startIndex: number;
}

export interface ParseBatchResponse {
  results: ExtractedRow[];
  provider: string;
  model: string;
}

export interface ImportSummary {
  totalInput: number;
  totalImported: number;
  totalSkipped: number;
}
