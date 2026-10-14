export type UserRole = 'OWNER' | 'ADMIN' | 'STAFF' | 'VIEWER';

export interface UserProfile {
  id: string;
  username?: string;
  password?: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type DocumentStatus = 'Draft' | 'Diajukan' | 'Dikembalikan' | 'Terbit' | 'Dibatalkan';
export type PaymentStatus =
  | 'Belum Bayar'
  | 'Dibayar sebagian'
  | 'Sudah di bayar'
  | 'dibatalkan'
  | 'Belum Dibayar'
  | 'Dibayar Sebagian'
  | 'Lunas'
  | 'Dibatalkan';
export type DueStatus = 'Normal' | 'Segera Jatuh Tempo' | 'Jatuh Tempo';

export type CanonicalPaymentStatus = 'Belum Bayar' | 'Dibayar sebagian' | 'Sudah di bayar' | 'dibatalkan';

export function normalizePaymentStatus(status?: string, docStatus?: string): CanonicalPaymentStatus {
  if (docStatus === 'Dibatalkan' || status === 'dibatalkan' || status === 'Dibatalkan') {
    return 'dibatalkan';
  }
  if (!status) return 'Belum Bayar';
  const s = status.trim().toLowerCase();
  if (s === 'lunas' || s === 'sudah di bayar' || s === 'sudah dibayar' || s === 'paid') {
    return 'Sudah di bayar';
  }
  if (s === 'dibayar sebagian' || s === 'sebagian' || s === 'partial' || s === 'partially paid') {
    return 'Dibayar sebagian';
  }
  if (s === 'dibatalkan' || s === 'batal' || s === 'canceled' || s === 'cancelled') {
    return 'dibatalkan';
  }
  return 'Belum Bayar';
}

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
  currency?: 'IDR' | 'USD';
  unit_price_usd?: number;
  custom_exchange_rate?: number;
  total_usd?: number;
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

export interface BankAccount {
  id: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  is_default?: boolean;
}

export interface GeneralClause {
  id: string;
  title?: string;
  content: string;
  is_active?: boolean;
}

export interface ClientSnapshot {
  sapaan: SapaanType;
  pic_name: string;
  company_name: string;
  billing_address: string;
  email: string;
  whatsapp: string;
}

export type AttachmentCategory =
  | 'PO'
  | 'BAST'
  | 'KONTRAK'
  | 'BUKTI_KERJA'
  | 'FAKTUR_PAJAK'
  | 'PENAWARAN'
  | 'LAINNYA';

export interface InvoiceAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  category: AttachmentCategory;
  description?: string;
  data_url?: string;
  drive_file_id?: string;
  drive_web_link?: string;
  uploaded_by_name?: string;
  uploaded_at: string;
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
  bank_accounts_snapshot?: BankAccount[];
  logo_snapshot_url?: string;
  items: InvoiceItem[];
  currency?: 'IDR' | 'USD';
  custom_exchange_rate?: number;
  subtotal: number;
  subtotal_usd?: number;
  discount_type: 'percent' | 'nominal';
  discount_value: number;
  discount_amount: number;
  tax_enabled: boolean;
  tax_rate: number;
  tax_amount: number;
  grand_total: number;
  grand_total_usd?: number;
  terbilang: string;
  client_notes?: string;
  work_terms?: string;
  payment_terms?: string;
  general_clauses?: GeneralClause[];
  attachments?: InvoiceAttachment[];
  created_by_name?: string;
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
  attachments?: InvoiceAttachment[];
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
  bank_accounts?: BankAccount[];
  general_clauses?: GeneralClause[];
  initial_sequence: number;
  current_sequence: number;
  default_work_terms?: string;
  default_payment_terms?: string;
  default_client_notes?: string;
  default_currency?: 'IDR' | 'USD';
  default_usd_rate?: number;
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

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  webContentLink?: string;
  createdTime?: string;
  modifiedTime?: string;
  size?: string;
  iconLink?: string;
  thumbnailLink?: string;
}

export interface DriveUser {
  displayName?: string;
  emailAddress?: string;
  photoLink?: string;
}

