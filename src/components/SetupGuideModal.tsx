import React, { useState } from 'react';
import {
  HelpCircle,
  Copy,
  Check,
  Database,
  Cloud,
  Shield,
  FileCode,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import { isSupabaseConfigured } from '../lib/supabase';

interface SetupGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SetupGuideModal: React.FC<SetupGuideModalProps> = ({ isOpen, onClose }) => {
  const [copiedSQL, setCopiedSQL] = useState(false);
  const [copiedEnv, setCopiedEnv] = useState(false);
  const [copiedNetlify, setCopiedNetlify] = useState(false);

  if (!isOpen) return null;

  const sqlSchema = `-- ==========================================================
-- SKEMA DATABASE POSTGRESQL (SUPABASE) - INVOICE DIGITAL
-- Jalankan di: Supabase Dashboard > SQL Editor > New query
-- ==========================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Tipe Enum
CREATE TYPE user_role AS ENUM ('OWNER', 'ADMIN', 'STAFF', 'VIEWER');
CREATE TYPE document_status AS ENUM ('Draft', 'Diajukan', 'Dikembalikan', 'Terbit', 'Dibatalkan');
CREATE TYPE payment_status AS ENUM ('Belum Dibayar', 'Dibayar Sebagian', 'Lunas');

-- 3. Tabel Profil Pengguna (Profiles)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'STAFF',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Tabel Master Klien
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sapaan TEXT NOT NULL CHECK (sapaan IN ('Tn.', 'Ny.')),
  pic_name TEXT NOT NULL,
  company_name TEXT NOT NULL,
  billing_address TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  whatsapp TEXT NOT NULL DEFAULT '',
  internal_notes TEXT DEFAULT '',
  assigned_staff_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_staff_name TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Tabel Invoices (Dokumen Induk)
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_number TEXT,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  status document_status NOT NULL DEFAULT 'Draft',
  payment_status payment_status NOT NULL DEFAULT 'Belum Dibayar',
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_by_name TEXT NOT NULL,
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_by_name TEXT,
  approved_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  returned_at TIMESTAMPTZ,
  return_notes TEXT,
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  cancelled_reason TEXT,
  active_token_hash TEXT,
  token_revoked BOOLEAN NOT NULL DEFAULT false,
  pdf_storage_path TEXT,
  revision_number INT NOT NULL DEFAULT 1,
  parent_invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Tabel Invoice Versions (Snapshot Arsip Dokumen)
CREATE TABLE invoice_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  version_number INT NOT NULL DEFAULT 1,
  publisher_snapshot JSONB NOT NULL,
  client_snapshot JSONB NOT NULL,
  bank_snapshot JSONB NOT NULL,
  logo_snapshot_url TEXT,
  issue_date DATE NOT NULL,
  due_date DATE NOT NULL,
  period TEXT NOT NULL,
  items JSONB NOT NULL,
  subtotal NUMERIC(15,2) NOT NULL DEFAULT 0,
  discount_type TEXT NOT NULL DEFAULT 'percent',
  discount_value NUMERIC(15,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  tax_enabled BOOLEAN NOT NULL DEFAULT false,
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 11,
  tax_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  grand_total NUMERIC(15,2) NOT NULL DEFAULT 0,
  terbilang TEXT NOT NULL,
  client_notes TEXT DEFAULT '',
  work_terms TEXT DEFAULT '',
  payment_terms TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Tabel Payments (Pembayaran & Reversal)
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount NUMERIC(15,2) NOT NULL,
  payment_date DATE NOT NULL,
  payment_method TEXT NOT NULL,
  reference_number TEXT,
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_by_name TEXT NOT NULL,
  is_reversed BOOLEAN NOT NULL DEFAULT false,
  reversed_at TIMESTAMPTZ,
  reversed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reversed_by_name TEXT,
  reversal_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Tabel Template Pesan
CREATE TABLE message_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Tabel Pengaturan Sistem
CREATE TABLE app_settings (
  id INT PRIMARY KEY DEFAULT 1,
  publisher_name TEXT NOT NULL,
  publisher_city TEXT NOT NULL,
  publisher_country TEXT NOT NULL,
  publisher_phone TEXT NOT NULL,
  publisher_email TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  bank_account_no TEXT NOT NULL,
  bank_account_name TEXT NOT NULL,
  logo_url TEXT,
  invoice_sequence_counter INT NOT NULL DEFAULT 1,
  default_client_notes TEXT DEFAULT '',
  default_work_terms TEXT DEFAULT '',
  default_payment_terms TEXT DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT single_row_check CHECK (id = 1)
);

-- 10. Tabel Audit Log (Immutable)
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID,
  user_name TEXT NOT NULL,
  user_role TEXT NOT NULL,
  action TEXT NOT NULL,
  target_id TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Konfigurasi Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy Profiles
CREATE POLICY "Profiles viewable by authenticated users" ON profiles
  FOR SELECT TO authenticated USING (true);

-- Policy Clients
CREATE POLICY "Clients full access for authenticated staff/admin" ON clients
  FOR ALL TO authenticated USING (true);

-- Policy Invoices (Internal)
CREATE POLICY "Invoices internal access" ON invoices
  FOR ALL TO authenticated USING (true);

-- Policy Invoice Versions
CREATE POLICY "Versions internal access" ON invoice_versions
  FOR ALL TO authenticated USING (true);

-- Storage Buckets:
-- Jalankan di Supabase Dashboard > Storage:
-- 1. Buat bucket 'invoices-pdf' (Private/Authenticated or token signed)
-- 2. Buat bucket 'invoices-logos' (Public)`;

  const envSample = `# .env (Frontend & Netlify Functions)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`;

  const netlifyToml = `[build]
  command = "npm run build"
  publish = "dist"

[functions]
  directory = "netlify/functions"
  node_bundler = "esbuild"

[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/:splat"
  status = 200

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="bg-white rounded-xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold">
              ID
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Panduan Setup Netlify & Supabase
              </h2>
              <p className="text-[11px] text-slate-500">
                Langkah deployment full-stack siap produksi untuk "Invoice Digital".
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-sm font-bold"
          >
            ✕
          </button>
        </div>

        {/* Status indicator */}
        <div
          className={`p-4 rounded-xl border flex items-center justify-between ${
            isSupabaseConfigured()
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}
        >
          <div className="flex items-center gap-3">
            <Database className="w-5 h-5" />
            <div>
              <h4 className="text-xs font-bold">
                {isSupabaseConfigured()
                  ? 'Supabase Terkoneksi'
                  : 'Mode Lokal Terproteksi Aktif'}
              </h4>
              <p className="text-[11px]">
                {isSupabaseConfigured()
                  ? 'Kredensial database Supabase telah terpasang.'
                  : 'Aplikasi saat ini berjalan mulus dengan data tersimpan di penyimpanan browser aman sampai Anda memasang kredensial Supabase.'}
              </p>
            </div>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-white/60">
            {isSupabaseConfigured() ? 'Cloud Active' : 'Local Ready'}
          </span>
        </div>

        {/* Step 1: Supabase Database Schema */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <FileCode className="w-4 h-4 text-indigo-600" />
              1. Skema Database PostgreSQL (Supabase SQL Migration)
            </h3>
            <button
              onClick={() => {
                navigator.clipboard.writeText(sqlSchema);
                setCopiedSQL(true);
                setTimeout(() => setCopiedSQL(false), 2000);
              }}
              className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
            >
              {copiedSQL ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedSQL ? 'Tersalin!' : 'Salin Skema SQL'}
            </button>
          </div>
          <pre className="p-3 bg-slate-900 text-slate-200 text-[10px] font-mono rounded-lg overflow-x-auto max-h-40 leading-relaxed">
            {sqlSchema}
          </pre>
        </div>

        {/* Step 2: Environment Variables */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-emerald-600" />
              2. Variabel Lingkungan (.env & Netlify Dashboard)
            </h3>
            <button
              onClick={() => {
                navigator.clipboard.writeText(envSample);
                setCopiedEnv(true);
                setTimeout(() => setCopiedEnv(false), 2000);
              }}
              className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 flex items-center gap-1"
            >
              {copiedEnv ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedEnv ? 'Tersalin!' : 'Salin Variabel .env'}
            </button>
          </div>
          <pre className="p-3 bg-slate-900 text-slate-200 text-[10px] font-mono rounded-lg overflow-x-auto leading-relaxed">
            {envSample}
          </pre>
        </div>

        {/* Step 3: netlify.toml */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Cloud className="w-4 h-4 text-blue-600" />
              3. Konfigurasi netlify.toml
            </h3>
            <button
              onClick={() => {
                navigator.clipboard.writeText(netlifyToml);
                setCopiedNetlify(true);
                setTimeout(() => setCopiedNetlify(false), 2000);
              }}
              className="text-[11px] font-semibold text-blue-700 hover:text-blue-900 flex items-center gap-1"
            >
              {copiedNetlify ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedNetlify ? 'Tersalin!' : 'Salin netlify.toml'}
            </button>
          </div>
          <pre className="p-3 bg-slate-900 text-slate-200 text-[10px] font-mono rounded-lg overflow-x-auto leading-relaxed">
            {netlifyToml}
          </pre>
        </div>

        <div className="flex justify-end pt-3 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold"
          >
            Mengerti, Tutup Panduan
          </button>
        </div>
      </div>
    </div>
  );
};
