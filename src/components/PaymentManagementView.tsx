import React, { useState, useMemo } from 'react';
import {
  CreditCard,
  Search,
  CheckCircle2,
  Ban,
  ArrowUpRight,
  Filter,
} from 'lucide-react';
import { Invoice, PaymentRecord, UserProfile } from '../types';
import { formatRupiah, formatTanggalIndonesia } from '../lib/terbilang';
import { dataService } from '../lib/data-service';

interface PaymentManagementViewProps {
  invoices: Invoice[];
  currentUser: UserProfile;
  onSelectInvoice: (invoiceId: string) => void;
  onRefresh: () => void;
}

export const PaymentManagementView: React.FC<PaymentManagementViewProps> = ({
  invoices,
  currentUser,
  onSelectInvoice,
  onRefresh,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'ACTIVE' | 'REVERSED'>('ALL');
  const [reversalTarget, setReversalTarget] = useState<{
    invoiceId: string;
    payment: PaymentRecord;
  } | null>(null);
  const [reversalReason, setReversalReason] = useState('');

  // Flatten all payments with invoice metadata
  const allPayments = useMemo(() => {
    const list: Array<{
      invoiceId: string;
      invoiceNumber: string;
      companyName: string;
      picName: string;
      payment: PaymentRecord;
    }> = [];

    invoices.forEach((inv) => {
      inv.payments.forEach((p) => {
        list.push({
          invoiceId: inv.id,
          invoiceNumber: inv.invoice_number || 'DRAFT',
          companyName: inv.current_version.client_snapshot.company_name || '-',
          picName: inv.current_version.client_snapshot.pic_name || '-',
          payment: p,
        });
      });
    });

    return list.sort(
      (a, b) =>
        new Date(b.payment.created_at).getTime() - new Date(a.payment.created_at).getTime()
    );
  }, [invoices]);

  const filteredPayments = useMemo(() => {
    return allPayments.filter((item) => {
      const q = searchTerm.toLowerCase();
      const refNo = item.payment.reference_number || item.payment.referenceNumber || '';
      const matchSearch =
        !q ||
        item.invoiceNumber.toLowerCase().includes(q) ||
        item.companyName.toLowerCase().includes(q) ||
        item.picName.toLowerCase().includes(q) ||
        refNo.toLowerCase().includes(q);

      const matchStatus =
        filterStatus === 'ALL' ||
        (filterStatus === 'ACTIVE' && !item.payment.is_reversed) ||
        (filterStatus === 'REVERSED' && item.payment.is_reversed);

      return matchSearch && matchStatus;
    });
  }, [allPayments, searchTerm, filterStatus]);

  const isOwnerAdmin = currentUser.role === 'OWNER' || currentUser.role === 'ADMIN';

  const totalMasukValid = allPayments
    .filter((p) => !p.payment.is_reversed)
    .reduce((sum, p) => sum + p.payment.amount, 0);

  const handleConfirmReversal = () => {
    if (!reversalTarget || !reversalReason.trim()) {
      alert('Alasan pembatalan pembayaran wajib diisi.');
      return;
    }
    const res = dataService.reversePayment(
      reversalTarget.invoiceId,
      reversalTarget.payment.id,
      reversalReason.trim()
    );
    alert(res.message);
    if (res.success) {
      setReversalTarget(null);
      setReversalReason('');
      onRefresh();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Riwayat Transaksi Pembayaran
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Daftar seluruh penerimaan pembayaran via transfer bank blu by BCA Digital.
          </p>
        </div>
        <div className="bg-emerald-50 px-4 py-2 rounded-lg border border-emerald-200 text-right">
          <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-800 block">
            Total Pembayaran Valid
          </span>
          <span className="text-lg font-bold text-emerald-900 font-mono">
            {formatRupiah(totalMasukValid)}
          </span>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Cari nomor invoice, klien, atau referensi..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Status Pembayaran:</span>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2.5 text-slate-800"
          >
            <option value="ALL">Semua Pembayaran</option>
            <option value="ACTIVE">Pembayaran Sah (Aktif)</option>
            <option value="REVERSED">Dibatalkan (Reversed)</option>
          </select>
        </div>
      </div>

      {/* Payments Table */}
      {allPayments.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400 mb-4">
            <CreditCard className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-800">Belum ada pembayaran</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1.5">
            Saat klien melakukan transfer, catat penerimaan pembayaran melalui halaman rincian invoice terkait.
          </p>
        </div>
      ) : filteredPayments.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400 text-xs">
          Tidak ada data pembayaran yang sesuai dengan filter pencarian.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Invoice & Klien</th>
                <th className="py-3 px-4">Tanggal Masuk</th>
                <th className="py-3 px-4">Nominal</th>
                <th className="py-3 px-4">Metode & Referensi</th>
                <th className="py-3 px-4">Status & Catatan</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPayments.map(({ invoiceId, invoiceNumber, companyName, picName, payment }) => (
                <tr key={payment.id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3.5 px-4 font-bold text-slate-900">
                    <button
                      onClick={() => onSelectInvoice(invoiceId)}
                      className="text-left hover:underline flex items-center gap-1 text-slate-900"
                    >
                      <span>{invoiceNumber}</span>
                      <ArrowUpRight className="w-3 h-3 text-slate-400" />
                    </button>
                    <p className="text-[11px] font-normal text-slate-500">
                      {companyName} ({picName})
                    </p>
                  </td>

                  <td className="py-3.5 px-4 text-slate-700">
                    {formatTanggalIndonesia(payment.payment_date)}
                  </td>

                  <td className="py-3.5 px-4 font-bold">
                    <span
                      className={
                        payment.is_reversed ? 'line-through text-slate-400' : 'text-emerald-700'
                      }
                    >
                      {formatRupiah(payment.amount)}
                    </span>
                  </td>

                  <td className="py-3.5 px-4">
                    <p className="font-medium text-slate-800">{payment.payment_method}</p>
                    <p className="text-[10px] text-slate-400">
                      Ref: {payment.reference_number || payment.referenceNumber || '-'}
                    </p>
                  </td>

                  <td className="py-3.5 px-4">
                    {payment.is_reversed ? (
                      <div>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                          Dibatalkan (Reversed)
                        </span>
                        <p className="text-[10px] text-rose-700 italic mt-0.5">
                          Alasan: {payment.reversal_reason}
                        </p>
                      </div>
                    ) : (
                      <div>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          Sah / Diterima
                        </span>
                        {payment.notes && (
                          <p className="text-[10px] text-slate-500 mt-0.5">{payment.notes}</p>
                        )}
                      </div>
                    )}
                  </td>

                  <td className="py-3.5 px-4 text-right">
                    {isOwnerAdmin && !payment.is_reversed && (
                      <button
                        onClick={() => setReversalTarget({ invoiceId, payment })}
                        className="px-2.5 py-1 text-[11px] font-semibold text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded border border-rose-200 transition-colors"
                      >
                        Batalkan
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Payment Reversal Modal */}
      {reversalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-2 text-rose-600">
              <Ban className="w-5 h-5" />
              <h3 className="text-base font-bold text-slate-900">Pembatalan (Reversal) Pembayaran</h3>
            </div>
            <p className="text-xs text-slate-600">
              Anda akan membatalkan pembayaran sebesar{' '}
              <span className="font-bold text-slate-900">
                {formatRupiah(reversalTarget.payment.amount)}
              </span>
              . Saldo sisa tagihan invoice akan disesuaikan kembali secara otomatis.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Alasan Pembatalan <span className="text-rose-500">*</span>:
              </label>
              <textarea
                rows={3}
                value={reversalReason}
                onChange={(e) => setReversalReason(e.target.value)}
                placeholder="Tulis alasan jelas pembatalan transaksi..."
                className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setReversalTarget(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700"
              >
                Tutup
              </button>
              <button
                onClick={handleConfirmReversal}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold"
              >
                Batalkan Pembayaran
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
