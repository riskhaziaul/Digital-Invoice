import { AppSettings, BankAccount, GeneralClause, MessageTemplate } from '../types';

export const INITIAL_BANK_ACCOUNTS: BankAccount[] = [
  {
    id: 'bank-1',
    bank_name: 'blu by BCA Digital',
    account_number: '000480500229',
    account_name: 'Riskha Ziaulhusna',
    is_default: true,
  },
  {
    id: 'bank-2',
    bank_name: 'Bank Central Asia (BCA)',
    account_number: '8691823901',
    account_name: 'Riskha Ziaulhusna',
    is_default: false,
  },
  {
    id: 'bank-3',
    bank_name: 'Bank Mandiri',
    account_number: '1370019284721',
    account_name: 'Riskha Ziaulhusna',
    is_default: false,
  },
];

export const INITIAL_GENERAL_CLAUSES: GeneralClause[] = [
  {
    id: 'clause-default-1',
    title: 'General Clause',
    content: '1. Item tambahan akan dikenakan biaya tambahan\n2. Biaya Tambahan akan ditagih langsung, di luar tagihan utama',
    is_active: true,
  },
];

export const INITIAL_APP_SETTINGS: AppSettings = {
  publisher_name: 'DIGITAL / MARCOMM TEAM',
  publisher_sub_name: 'Brand, Digital & Communication Agency',
  publisher_city: 'Yogyakarta',
  publisher_country: 'Indonesia',
  publisher_phone: '+62 896 9357 9552',
  publisher_email: 'riskhaziaul@gmail.com',
  logo_url: undefined,
  logo_version: 1,
  bank_name: 'blu by BCA Digital',
  bank_account_no: '000480500229',
  bank_account_name: 'Riskha Ziaulhusna',
  bank_accounts: INITIAL_BANK_ACCOUNTS,
  general_clauses: INITIAL_GENERAL_CLAUSES,
  initial_sequence: 1,
  current_sequence: 0,
  default_work_terms: '1. Pembayaran ditransfer ke rekening resmi blu by BCA Digital yang tertera.\n2. Pembayaran dianggap sah setelah bukti transfer dikonfirmasi.',
  default_payment_terms: 'Jatuh tempo pembayaran adalah 14 (empat belas) hari kalender setelah tanggal invoice diterbitkan.',
  default_client_notes: '',
  default_currency: 'IDR',
  default_usd_rate: 16250,
  updated_at: new Date().toISOString(),
};

export const INITIAL_MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    id: 'tpl-1',
    type: 'pengiriman_invoice',
    name: 'Pengiriman Invoice Standar',
    title: 'Pengiriman Invoice Standar',
    body: 'Yth. {Sapaan} {Nama}, berikut kami sampaikan tagihan invoice {NomorInvoice} untuk periode {Periode}, dengan total tagihan {GrandTotal}. Terlampir berkas resmi PDF invoice untuk rincian lengkapnya. Terima kasih.',
    is_default: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'tpl-2',
    type: 'pengingat_sebelum_jatuh_tempo',
    name: 'Pengingat H-3 Jatuh Tempo',
    title: 'Pengingat H-3 Jatuh Tempo',
    body: 'Yth. {Sapaan} {Nama}, kami menginformasikan invoice {NomorInvoice} sebesar {GrandTotal} akan jatuh tempo pada {JatuhTempo}. Terlampir berkas PDF invoice sebagai referensi penagihan. Terima kasih.',
    is_default: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'tpl-3',
    type: 'pengingat_setelah_jatuh_tempo',
    name: 'Pengingat Lewat Jatuh Tempo',
    title: 'Pengingat Lewat Jatuh Tempo',
    body: 'Yth. {Sapaan} {Nama}, invoice {NomorInvoice} dengan sisa tagihan {SisaTagihan} telah melewati tanggal jatuh tempo ({JatuhTempo}). Terlampir berkas resmi PDF invoice. Mohon kesediaannya melakukan pembayaran ke rekening kami. Terima kasih.',
    is_default: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'tpl-4',
    type: 'konfirmasi_pembayaran',
    name: 'Konfirmasi Pembayaran Masuk',
    title: 'Konfirmasi Pembayaran Masuk',
    body: 'Yth. {Sapaan} {Nama}, terima kasih telah melakukan pembayaran sebesar {PembayaranDiterima} untuk invoice {NomorInvoice}. Status sisa tagihan saat ini: {SisaTagihan}. Terlampir dokumen/berkas resmi invoice terkait. Terima kasih.',
    is_default: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'tpl-5',
    type: 'pengiriman_revisi',
    name: 'Pengiriman Revisi Resmi',
    title: 'Pengiriman Revisi Resmi',
    body: 'Yth. {Sapaan} {Nama}, berikut kami sampaikan revisi resmi untuk invoice {NomorInvoice} dengan grand total {GrandTotal}. Terlampir berkas PDF invoice revisi terbaru. Terima kasih.',
    is_default: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export const DEFAULT_MESSAGE_TEMPLATES = INITIAL_MESSAGE_TEMPLATES;
