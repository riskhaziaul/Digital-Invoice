export type UserRole = 'OWNER' | 'ADMIN' | 'STAFF' | 'VIEWER';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type DocumentStatus = 'Draft' | 'Diajukan' | 'Dikembalikan' | 'Terbit' | 'Dibatalkan';
export type PaymentStatus = 'Belum Dibayar' | 'Dibayar Sebagian' | 'Lunas';
export type DueStatus = 'Normal' | 'Segera Jatuh Tempo' | 'Jatuh Tempo';

export type SapaanType = 'Tn.' | 'Ny.';

export interface Client {
  id: string;
  sapaan: SapaanType;
  pic_name: string;
  company_name: string;
  billing_address: string;
  email: string;
  whatsapp: string;
  internal_notes?: string;
  assigned_user_ids: string[]; // List of staff user IDs assigned
  assigned_staff_id?: string;
  assigned_staff_name?: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface InvoiceItem {
  id: string;
  sort_order: number;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total: number;
}

export interface PublisherSnapshot {
  name: string;
  sub_name: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  logo_url?: string;
}

export interface BankSnapshot {
  bank_name: string; // 'blu by BCA Digital'
  account_number: string; // '000480500229'
  account_name: string; // 'Riskha Ziaulhusna'
}

export interface ClientSnapshot {
  sapaan: SapaanType;
  pic_name: string;
  company_name: string;
  billing_address: string;
  email: string;
  whatsapp: string;
}

export interface InvoiceVersion {
  id: string;
  invoice_id: string;
  version_number: number;
  issue_date: string;
  due_date: string;
  period: string;
  client_snapshot: ClientSnapshot;
  publisher_snapshot: PublisherSnapshot;
  bank_snapshot: BankSnapshot;
  logo_snapshot_url?: string;
  items: InvoiceItem[];
  subtotal: number;
  discount_type: 'percent' | 'nominal';
  discount_value: number;
  discount_amount: number;
  tax_enabled: boolean;
  tax_rate: number;
  tax_amount: number;
  grand_total: number;
  terbilang: string;
  client_notes?: string;
  work_terms?: string;
  payment_terms?: string;
  pdf_storage_path?: string;
  created_at: string;
}

export interface PaymentRecord {
  id: string;
  invoice_id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  reference_number?: string;
  referenceNumber?: string;
  notes?: string;
  recorded_by_id: string;
  recorded_by_name: string;
  is_reversed: boolean;
  reversal_reason?: string;
  reversed_at?: string;
  reversed_by_name?: string;
  created_at: string;
}

export interface ShareToken {
  id: string;
  invoice_id: string;
  version_id: string;
  token_hash: string;
  raw_token?: string; // only exposed when created/re-generated
  is_active: boolean;
  revoked_at?: string;
  revoked_by?: string;
  created_at: string;
}

export interface Invoice {
  id: string;
  invoice_number?: string; // Formatted e.g. INV/DIGITAL/IX/26-0001
  sequence_number?: number;
  status: DocumentStatus;
  payment_status: PaymentStatus;
  original_invoice_id?: string; // For revisions
  revision_number: number; // 1 for first version, 2 for rev 1, etc.
  assigned_user_id?: string;
  client_id?: string;
  current_version: InvoiceVersion;
  submission_notes?: string;
  return_notes?: string;
  payments: PaymentRecord[];
  active_token?: string;
  created_by_id: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

export type TemplateType =
  | 'pengiriman_invoice'
  | 'pengingat_sebelum_jatuh_tempo'
  | 'pengingat_setelah_jatuh_tempo'
  | 'konfirmasi_pembayaran'
  | 'pengiriman_revisi';

export interface MessageTemplate {
  id: string;
  type: TemplateType;
  title: string;
  name?: string;
  body: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface AppSettings {
  id?: string;
  publisher_name: string;
  publisher_sub_name: string;
  publisher_city: string;
  publisher_country: string;
  publisher_phone: string;
  publisher_email: string;
  logo_url?: string;
  logo_version: number;
  bank_name: string;
  bank_account_no: string;
  bank_account_name: string;
  initial_sequence: number;
  current_sequence: number;
  default_work_terms?: string;
  default_payment_terms?: string;
  default_client_notes?: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string;
  user_name?: string;
  user_email: string;
  user_role: UserRole;
  action: string;
  entity_type: 'INVOICE' | 'CLIENT' | 'PAYMENT' | 'USER' | 'SETTINGS' | 'TOKEN' | 'TEMPLATE';
  entity_id: string;
  details: string | any;
  created_at: string;
}

export type AuditLogEntry = AuditLog;
