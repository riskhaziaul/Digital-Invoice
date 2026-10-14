import React, { useState } from 'react';
import { Edit3, Check, X, AlertTriangle, HelpCircle } from 'lucide-react';
import { CanonicalPaymentStatus, Invoice, PaymentStatus } from '../types';
import { dataService } from '../lib/data-service';

interface BulkEditModalProps {
  selectedInvoiceIds: string[];
  invoices: Invoice[];
  onClose: () => void;
  onSuccess: () => void;
}

export const BulkEditModal: React.FC<BulkEditModalProps> = ({
  selectedInvoiceIds,
  invoices,
  onClose,
  onSuccess,
}) => {
  const [selectedStatus, setSelectedStatus] = useState<CanonicalPaymentStatus>('Sudah di bayar');
  const [reasonNote, setReasonNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedInvoices = invoices.filter((i) => selectedInvoiceIds.includes(i.id));

  const handleApply = async () => {
    if (selectedInvoiceIds.length === 0) return;
    setIsSubmitting(true);

    try {
      const res = dataService.bulkUpdatePaymentStatus(
        selectedInvoiceIds,
        selectedStatus,
        reasonNote.trim()
      );
      alert(res.message);
      if (res.success) {
        onSuccess();
      }
    } catch (err: any) {
      console.error('Bulk edit error:', err);
      alert('Terjadi kesalahan saat memperbarui: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const statusDescriptions: Record<CanonicalPaymentStatus, { title: string; desc: string; badgeClass: string }> = {
    'Belum Bayar': {
      title: 'Belum Bayar',
      desc: 'Tagihan belum dilunasi sama sekali oleh klien.',
      badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
    },
    'Dibayar sebagian': {
      title: 'Dibayar sebagian',
      desc: 'Klien telah membayar sebagian (misal uang muka / DP) dan masih ada sisa tagihan.',
      badgeClass: 'bg-blue-100 text-blue-900 border-blue-300',
    },
    'Sudah di bayar': {
      title: 'Sudah di bayar',
      desc: 'Tagihan telah lunas sepenuhnya dibayarkan.',
      badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    },
    'dibatalkan': {
      title: 'dibatalkan',
      desc: 'Invoice dibatalkan dan tautan akses publik dicabut.',
      badgeClass: 'bg-rose-100 text-rose-900 border-rose-300',
    },
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Edit Massal Keterangan Pembayaran</h2>
              <p className="text-xs text-slate-500">
                Ubah status pembayaran untuk {selectedInvoiceIds.length} invoice sekaligus.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Selection Cards */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-700">
            Pilih Keterangan Pembayaran Baru:
          </label>
          <div className="grid grid-cols-1 gap-2">
            {(['Belum Bayar', 'Dibayar sebagian', 'Sudah di bayar', 'dibatalkan'] as CanonicalPaymentStatus[]).map(
              (st) => {
                const info = statusDescriptions[st];
                const isSelected = selectedStatus === st;
                return (
                  <div
                    key={st}
                    onClick={() => setSelectedStatus(st)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/40 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="bulk_status"
                      checked={isSelected}
                      onChange={() => setSelectedStatus(st)}
                      className="mt-1 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded border ${info.badgeClass}`}>
                          {info.title}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">{info.desc}</p>
                    </div>
                  </div>
                );
              }
            )}
          </div>
        </div>

        {/* Warning if dibatalkan is chosen */}
        {selectedStatus === 'dibatalkan' && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <p>
              Memilih status <strong>dibatalkan</strong> akan mencabut tautan publik dan menandai dokumen sebagai dibatalkan.
            </p>
          </div>
        )}

        {/* Catatan / Alasan (Opsional) */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            Catatan Perubahan (Opsional):
          </label>
          <input
            type="text"
            value={reasonNote}
            onChange={(e) => setReasonNote(e.target.value)}
            placeholder="Contoh: Konfirmasi rekening koran BCA tgl 22..."
            className="w-full text-xs p-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-slate-900"
          />
        </div>

        {/* Selected Invoices Preview list */}
        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
          <span className="text-[11px] font-bold text-slate-600 block mb-1">
            Daftar Invoice Terpilih ({selectedInvoices.length}):
          </span>
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
            {selectedInvoices.map((inv) => (
              <span
                key={inv.id}
                className="text-[10px] font-semibold bg-white border border-slate-200 px-2 py-0.5 rounded text-slate-700"
              >
                {inv.invoice_number || 'DRAFT'}
              </span>
            ))}
          </div>
        </div>

        {/* Modal Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Batal
          </button>
          <button
            disabled={isSubmitting}
            onClick={handleApply}
            className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-2 shadow-xs transition-colors disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
            Terapkan ke {selectedInvoiceIds.length} Invoice
          </button>
        </div>
      </div>
    </div>
  );
};
