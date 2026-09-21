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
import { Invoice, UserProfile } from '../types';
import { formatRupiah, formatTanggalIndonesia } from '../lib/terbilang';

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
  // Rekap: hanya menghitung versi aktif invoice berstatus 'Terbit'
  const publishedInvoices = invoices.filter((i) => i.status === 'Terbit');

  const totalNilaiTerbit = publishedInvoices.reduce(
    (sum, inv) => sum + (inv.current_version.grand_total || 0),
    0
  );

  const totalPembayaranMasuk = publishedInvoices.reduce((sum, inv) => {
    const validPayments = inv.payments
      .filter((p) => !p.is_reversed)
      .reduce((pSum, p) => pSum + p.amount, 0);
    return sum + validPayments;
  }, 0);

  const totalSisaTagihan = Math.max(0, totalNilaiTerbit - totalPembayaranMasuk);

  // Overdue / Due soon detection based on Asia/Jakarta local date
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  const dueInvoices = publishedInvoices
    .filter((inv) => {
      const validPayments = inv.payments
        .filter((p) => !p.is_reversed)
        .reduce((sum, p) => sum + p.amount, 0);
      const remaining = inv.current_version.grand_total - validPayments;
      return remaining > 0 && inv.current_version.due_date;
    })
    .map((inv) => {
      const dueDate = new Date(inv.current_version.due_date);
      const diffTime = dueDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const validPayments = inv.payments
        .filter((p) => !p.is_reversed)
        .reduce((sum, p) => sum + p.amount, 0);
      const remaining = inv.current_version.grand_total - validPayments;

      return {
        invoice: inv,
        diffDays,
        isOverdue: diffDays < 0,
        isDueSoon: diffDays >= 0 && diffDays <= 3,
        remaining,
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
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold tracking-wide transition-colors shadow-xs"
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
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold tracking-wide transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4" />
              Buat Invoice Pertama
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Total Terbit */}
            <div className="bg-white p-5 rounded-xl border border-slate-200">
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

            {/* Pembayaran Diterima */}
            <div className="bg-white p-5 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">Pembayaran Masuk</span>
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-bold text-emerald-700 mt-2 tracking-tight">
                {formatRupiah(totalPembayaranMasuk)}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Dari transfer resmi blu by BCA Digital
              </p>
            </div>

            {/* Sisa Tagihan */}
            <div className="bg-white p-5 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">Sisa Tagihan Tertunggak</span>
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-bold text-amber-900 mt-2 tracking-tight">
                {formatRupiah(totalSisaTagihan)}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Menunggu pelunasan dari klien
              </p>
            </div>
          </div>

          {/* Overdue / Due Soon Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Invoice Jatuh Tempo */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <h2 className="text-sm font-bold text-slate-900">Perhatian Jatuh Tempo</h2>
                </div>
                <span className="text-xs text-slate-500">Zona Waktu: Asia/Jakarta</span>
              </div>

              {dueInvoices.length === 0 ? (
                <div className="py-8 text-center text-slate-400">
                  <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500 mb-2" />
                  <p className="text-xs font-medium text-slate-600">Tidak ada tagihan tertunggak atau mendesak.</p>
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

            {/* Invoices by Status Overview */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
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
