import React from 'react';
import {
  FileText,
  CreditCard,
  AlertCircle,
  Plus,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import { Invoice, UserProfile, normalizePaymentStatus } from '../types';
import { formatRupiah, formatTanggalIndonesia, getInvoicePaymentSummary } from '../lib/terbilang';

interface DashboardViewProps {
  invoices: Invoice[];
  currentUser: UserProfile;
  onCreateNewInvoice: () => void;
  onSelectInvoice: (invoiceId: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  invoices,
  currentUser,
  onCreateNewInvoice,
  onSelectInvoice,
}) => {
  // Hanya menghitung versi aktif invoice berstatus 'Terbit' dan tidak dibatalkan
  const publishedInvoices = invoices.filter(
    (i) => i.status === 'Terbit' && normalizePaymentStatus(i.payment_status, i.status) !== 'dibatalkan'
  );

  // Total Nilai Terbit: akumulasi nilai tagihan resmi seluruh invoice berstatus Terbit
  const totalNilaiTerbit = publishedInvoices.reduce(
    (sum, inv) => sum + (inv.current_version?.grand_total || 0),
    0
  );

  // Total Terbayar: akumulasi pembayaran masuk dari invoice terbit (lunas maupun sebagian)
  const totalTerbayar = publishedInvoices.reduce((sum, inv) => {
    return sum + getInvoicePaymentSummary(inv).paidAmount;
  }, 0);

  // Total Tertunda: sisa nilai tagihan yang belum lunas
  const totalTertunda = publishedInvoices.reduce((sum, inv) => {
    return sum + getInvoicePaymentSummary(inv).remainingAmount;
  }, 0);

  // Hitungan jumlah invoice
  const countLunas = publishedInvoices.filter(
    (inv) => getInvoicePaymentSummary(inv).isPaid
  ).length;

  const countTertunda = publishedInvoices.filter((inv) => {
    const s = getInvoicePaymentSummary(inv);
    return !s.isPaid && s.remainingAmount > 0;
  }).length;

  // Daftar Jatuh Tempo: HANYA invoice yang MASIH BELUM LUNAS (sisa tagihan > 0)
  // Invoice yang sudah dibayar lunas otomatis HILANG dari daftar ini
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const dueInvoices = publishedInvoices
    .filter((inv) => {
      const summary = getInvoicePaymentSummary(inv);
      // Hilangkan invoice yang sudah dibayar, sisa 0, atau dibatalkan
      if (summary.isPaid || summary.remainingAmount <= 0 || summary.isCanceled) {
        return false;
      }
      return Boolean(inv.current_version?.due_date);
    })
    .map((inv) => {
      const summary = getInvoicePaymentSummary(inv);
      const dueDateRaw = new Date(inv.current_version.due_date);
      const dueDate = new Date(dueDateRaw.getFullYear(), dueDateRaw.getMonth(), dueDateRaw.getDate());
      const diffTime = dueDate.getTime() - today.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      return {
        invoice: inv,
        diffDays,
        isOverdue: diffDays < 0,
        isDueSoon: diffDays >= 0 && diffDays <= 7,
        remaining: summary.remainingAmount,
      };
    })
    .sort((a, b) => a.diffDays - b.diffDays);

  const canCreate = currentUser.role !== 'VIEWER';

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Action */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Ringkasan Invoice & Tagihan</h1>
          <p className="text-xs text-slate-500 mt-1">
            Pantau status tagihan terbit, pembayaran masuk, serta jatuh tempo secara real-time.
          </p>
        </div>
        {canCreate && (
          <button
            id="btn-dashboard-create-invoice"
            onClick={onCreateNewInvoice}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold tracking-wide transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Buat Invoice Baru
          </button>
        )}
      </div>

      {/* Empty State when zero invoices */}
      {invoices.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400 mb-4">
            <FileText className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-800">Belum ada invoice</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1.5 mb-6">
            Database invoice masih bersih. Mulai buat dokumen invoice penagihan resmi pertama untuk klien Anda.
          </p>
          {canCreate && (
            <button
              id="btn-empty-create-first-invoice"
              onClick={onCreateNewInvoice}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold tracking-wide transition-colors shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Buat Invoice Pertama
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Summary Metric Cards: Total Terbit, Total Terbayar, Total Tertunda */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Total Invoice Terbit */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">Total Invoice Terbit</span>
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
                  <FileText className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-900 mt-2 tracking-tight">
                {formatRupiah(totalNilaiTerbit)}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                {publishedInvoices.length} invoice aktif terbit
              </p>
            </div>

            {/* Total Terbayar */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">Total Terbayar</span>
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-bold text-emerald-700 mt-2 tracking-tight">
                {formatRupiah(totalTerbayar)}
              </p>
              <p className="text-[11px] text-emerald-600 font-medium mt-1">
                {countLunas} invoice lunas terkonfirmasi
              </p>
            </div>

            {/* Total Tertunda */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">Total Tertunda</span>
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-bold text-amber-900 mt-2 tracking-tight">
                {formatRupiah(totalTertunda)}
              </p>
              <p className="text-[11px] text-amber-700 font-medium mt-1">
                {countTertunda} invoice menunggu pelunasan
              </p>
            </div>
          </div>

          {/* Overdue / Due Soon Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Invoice Jatuh Tempo (Hanya yang belum dibayar) */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <h2 className="text-sm font-bold text-slate-900">Perhatian Jatuh Tempo</h2>
                </div>
                <span className="text-xs text-slate-400">Khusus invoice belum lunas</span>
              </div>

              {dueInvoices.length === 0 ? (
                <div className="py-8 text-center text-slate-400">
                  <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500 mb-2" />
                  <p className="text-xs font-medium text-slate-600">
                    Tidak ada tagihan tertunggak atau mendesak. Seluruh invoice jatuh tempo telah dibayar.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {dueInvoices.slice(0, 5).map((item) => (
                    <div
                      key={item.invoice.id}
                      onClick={() => onSelectInvoice(item.invoice.id)}
                      className="py-3 flex items-center justify-between hover:bg-slate-50 px-2 rounded-lg cursor-pointer transition-colors"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">
                            {item.invoice.invoice_number}
                          </span>
                          {item.isOverdue ? (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-800">
                              Terlambat {Math.abs(item.diffDays)} hari
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900">
                              Jatuh tempo {item.diffDays === 0 ? 'hari ini' : `${item.diffDays} hari lagi`}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5">
                          {item.invoice.current_version.client_snapshot.company_name} (
                          {item.invoice.current_version.client_snapshot.sapaan}{' '}
                          {item.invoice.current_version.client_snapshot.pic_name})
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold text-slate-900">{formatRupiah(item.remaining)}</p>
                        <p className="text-[10px] text-slate-400">
                          {formatTanggalIndonesia(item.invoice.current_version.due_date)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Invoices by Payment Status Overview */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-slate-900">Rekap Keterangan Pembayaran</h2>
                <span className="text-xs text-slate-400">Total: {invoices.length} invoice</span>
              </div>

              <div className="space-y-3">
                {[
                  {
                    label: 'Sudah di bayar',
                    match: (inv: Invoice) => normalizePaymentStatus(inv.payment_status, inv.status) === 'Sudah di bayar',
                    color: 'bg-emerald-500',
                  },
                  {
                    label: 'Dibayar sebagian',
                    match: (inv: Invoice) => normalizePaymentStatus(inv.payment_status, inv.status) === 'Dibayar sebagian',
                    color: 'bg-blue-500',
                  },
                  {
                    label: 'Belum Bayar',
                    match: (inv: Invoice) => normalizePaymentStatus(inv.payment_status, inv.status) === 'Belum Bayar',
                    color: 'bg-amber-500',
                  },
                  {
                    label: 'dibatalkan',
                    match: (inv: Invoice) => normalizePaymentStatus(inv.payment_status, inv.status) === 'dibatalkan',
                    color: 'bg-rose-500',
                  },
                ].map((item) => {
                  const count = invoices.filter((i) => item.match(i)).length;
                  const pct = invoices.length > 0 ? (count / invoices.length) * 100 : 0;
                  return (
                    <div key={item.label} className="space-y-1">
                      <div className="flex justify-between text-xs font-medium">
                        <span className="text-slate-700">{item.label}</span>
                        <span className="text-slate-900 font-bold">
                          {count} ({Math.round(pct)}%)
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full ${item.color}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Invoices by Status Overview */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-slate-900">Distribusi Status Dokumen</h2>
                <span className="text-xs text-slate-400">Total: {invoices.length} dokumen</span>
              </div>

              <div className="space-y-3">
                {[
                  { label: 'Terbit', status: 'Terbit', color: 'bg-emerald-500' },
                  { label: 'Menunggu Persetujuan (Diajukan)', status: 'Diajukan', color: 'bg-blue-500' },
                  { label: 'Draft Belum Lengkap', status: 'Draft', color: 'bg-slate-400' },
                  { label: 'Dikembalikan untuk Revisi', status: 'Dikembalikan', color: 'bg-amber-500' },
                  { label: 'Dibatalkan', status: 'Dibatalkan', color: 'bg-rose-500' },
                ].map((s) => {
                  const count = invoices.filter((i) => i.status === s.status).length;
                  const pct = invoices.length > 0 ? (count / invoices.length) * 100 : 0;
                  return (
                    <div key={s.status} className="space-y-1">
                      <div className="flex justify-between text-xs font-medium">
                        <span className="text-slate-700">{s.label}</span>
                        <span className="text-slate-900 font-bold">
                          {count} ({Math.round(pct)}%)
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full ${s.color}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
