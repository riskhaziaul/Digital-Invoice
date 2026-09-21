import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  Plus,
  FileText,
  Eye,
  Edit2,
  Copy,
  Download,
  Link,
  Ban,
  CheckCircle,
  Clock,
  Send,
  MoreVertical,
  Check,
} from 'lucide-react';
import { DocumentStatus, Invoice, PaymentStatus, UserProfile } from '../types';
import { formatRupiah, formatTanggalIndonesia } from '../lib/terbilang';
import { generateInvoicePDF } from '../lib/pdf-generator';

interface InvoiceListViewProps {
  invoices: Invoice[];
  currentUser: UserProfile;
  onCreateInvoice: () => void;
  onSelectInvoice: (invoiceId: string) => void;
  onEditDraft: (invoiceId: string) => void;
  onDuplicate: (invoiceId: string) => void;
  onCancelInvoice: (invoiceId: string, reason: string) => void;
}

export const InvoiceListView: React.FC<InvoiceListViewProps> = ({
  invoices,
  currentUser,
  onCreateInvoice,
  onSelectInvoice,
  onEditDraft,
  onDuplicate,
  onCancelInvoice,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDocStatus, setFilterDocStatus] = useState<string>('ALL');
  const [filterPaymentStatus, setFilterPaymentStatus] = useState<string>('ALL');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Cancellation modal state
  const [cancelTarget, setCancelTarget] = useState<Invoice | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const v = inv.current_version;
      const client = v.client_snapshot;

      // Search matching: nomor, nama penerima, perusahaan
      const q = searchTerm.toLowerCase();
      const matchSearch =
        !q ||
        (inv.invoice_number && inv.invoice_number.toLowerCase().includes(q)) ||
        (client.pic_name && client.pic_name.toLowerCase().includes(q)) ||
        (client.company_name && client.company_name.toLowerCase().includes(q));

      // Filter Doc Status
      const matchDocStatus = filterDocStatus === 'ALL' || inv.status === filterDocStatus;

      // Filter Payment Status
      const matchPaymentStatus =
        filterPaymentStatus === 'ALL' || inv.payment_status === filterPaymentStatus;

      return matchSearch && matchDocStatus && matchPaymentStatus;
    });
  }, [invoices, searchTerm, filterDocStatus, filterPaymentStatus]);

  const handleCopyLink = (invoice: Invoice, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!invoice.active_token) return;
    const url = `${window.location.origin}/invoice/${invoice.active_token}`;
    navigator.clipboard.writeText(url);
    setCopiedId(invoice.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDownloadPDF = async (invoice: Invoice, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const pdfBytes = await generateInvoicePDF({
        invoiceNumber: invoice.invoice_number || 'DRAFT',
        version: invoice.current_version,
      });
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeNumber = (invoice.invoice_number || 'DRAFT').replace(/[^a-zA-Z0-9]/g, '_');
      const safeCompany = (invoice.current_version.client_snapshot.company_name || 'Client').replace(/[^a-zA-Z0-9]/g, '_');
      a.download = `Invoice_${safeNumber}_${safeCompany}_v${invoice.revision_number}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download error:', err);
      alert('Gagal mengunduh PDF.');
    }
  };

  const getDocStatusBadge = (status: DocumentStatus) => {
    switch (status) {
      case 'Terbit':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800">Terbit</span>;
      case 'Diajukan':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-800">Diajukan</span>;
      case 'Draft':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-700">Draft</span>;
      case 'Dikembalikan':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-900">Dikembalikan</span>;
      case 'Dibatalkan':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-rose-100 text-rose-800">Dibatalkan</span>;
    }
  };

  const getPaymentStatusBadge = (status: PaymentStatus) => {
    switch (status) {
      case 'Lunas':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">Lunas</span>;
      case 'Dibayar Sebagian':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">Sebagian</span>;
      case 'Belum Dibayar':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-50 text-slate-600 border border-slate-200">Belum Bayar</span>;
    }
  };

  const canCreate = currentUser.role !== 'VIEWER';

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Daftar Dokumen Invoice</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Kelola draft, pengajuan verifikasi, penerbitan, dan link akses klien.
          </p>
        </div>
        {canCreate && (
          <button
            id="btn-list-create-invoice"
            onClick={onCreateInvoice}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold tracking-wide transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" />
            Buat Invoice Baru
          </button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Cari nomor, klien, atau perusahaan..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          {/* Status Dokumen */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 font-medium">Status:</span>
            <select
              value={filterDocStatus}
              onChange={(e) => setFilterDocStatus(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2 text-slate-800 focus:outline-none"
            >
              <option value="ALL">Semua Dokumen</option>
              <option value="Draft">Draft</option>
              <option value="Diajukan">Diajukan</option>
              <option value="Dikembalikan">Dikembalikan</option>
              <option value="Terbit">Terbit</option>
              <option value="Dibatalkan">Dibatalkan</option>
            </select>
          </div>

          {/* Status Pembayaran */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 font-medium">Bayar:</span>
            <select
              value={filterPaymentStatus}
              onChange={(e) => setFilterPaymentStatus(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2 text-slate-800 focus:outline-none"
            >
              <option value="ALL">Semua Pembayaran</option>
              <option value="Belum Dibayar">Belum Dibayar</option>
              <option value="Dibayar Sebagian">Dibayar Sebagian</option>
              <option value="Lunas">Lunas</option>
            </select>
          </div>
        </div>
      </div>

      {/* Invoice Table / Cards */}
      {invoices.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400 mb-4">
            <FileText className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-800">Belum ada invoice</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1.5 mb-6">
            Database invoice masih kosong. Buat dokumen invoice pertama Anda dengan mengklik tombol di bawah.
          </p>
          {canCreate && (
            <button
              onClick={onCreateInvoice}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold tracking-wide transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4" />
              Buat Invoice Pertama
            </button>
          )}
        </div>
      ) : filteredInvoices.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400">
          <p className="text-xs">Tidak ada invoice yang sesuai dengan pencarian atau filter Anda.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Nomor Invoice</th>
                  <th className="py-3 px-4">Klien & Perusahaan</th>
                  <th className="py-3 px-4">Tanggal & Jatuh Tempo</th>
                  <th className="py-3 px-4">Total Tagihan</th>
                  <th className="py-3 px-4">Status Dokumen</th>
                  <th className="py-3 px-4">Status Bayar</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInvoices.map((inv) => {
                  const v = inv.current_version;
                  const client = v.client_snapshot;
                  const isStaff = currentUser.role === 'STAFF';
                  const isOwnerAdmin = currentUser.role === 'OWNER' || currentUser.role === 'ADMIN';

                  return (
                    <tr
                      key={inv.id}
                      onClick={() => onSelectInvoice(inv.id)}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <span>{inv.invoice_number || 'DRAFT (Belum Terbit)'}</span>
                          {inv.revision_number > 1 && (
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-purple-100 text-purple-900">
                              Rev {inv.revision_number - 1}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-normal text-slate-400">
                          Dibuat oleh: {inv.created_by_name}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <p className="font-semibold text-slate-900">
                          {client.company_name || '(Belum diisi)'}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {client.sapaan} {client.pic_name || '-'}
                        </p>
                      </td>

                      <td className="py-3.5 px-4">
                        <p className="font-medium text-slate-800">
                          {formatTanggalIndonesia(v.issue_date)}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          Jatuh Tempo: {formatTanggalIndonesia(v.due_date)}
                        </p>
                      </td>

                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        {formatRupiah(v.grand_total)}
                        {inv.payments.length > 0 && (
                          <p className="text-[10px] font-normal text-emerald-600">
                            Masuk:{' '}
                            {formatRupiah(
                              inv.payments
                                .filter((p) => !p.is_reversed)
                                .reduce((s, p) => s + p.amount, 0)
                            )}
                          </p>
                        )}
                      </td>

                      <td className="py-3.5 px-4">{getDocStatusBadge(inv.status)}</td>

                      <td className="py-3.5 px-4">
                        {inv.status === 'Terbit' ? (
                          getPaymentStatusBadge(inv.payment_status)
                        ) : (
                          <span className="text-slate-400 text-[11px]">-</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {/* View detail */}
                          <button
                            title="Lihat Rincian"
                            onClick={() => onSelectInvoice(inv.id)}
                            className="p-1.5 rounded text-slate-600 hover:text-slate-900 hover:bg-slate-200 transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Edit (Draft or Dikembalikan) */}
                          {(inv.status === 'Draft' || inv.status === 'Dikembalikan') && (
                            <button
                              title="Edit Draft"
                              onClick={() => onEditDraft(inv.id)}
                              className="p-1.5 rounded text-blue-600 hover:text-blue-800 hover:bg-blue-50 transition-colors"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}

                          {/* Duplicate */}
                          {currentUser.role !== 'VIEWER' && (
                            <button
                              title="Duplikasi Invoice"
                              onClick={() => onDuplicate(inv.id)}
                              className="p-1.5 rounded text-slate-600 hover:text-slate-900 hover:bg-slate-200 transition-colors"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                          )}

                          {/* Download PDF */}
                          {inv.status === 'Terbit' && (
                            <button
                              title="Unduh PDF Resmi"
                              onClick={(e) => handleDownloadPDF(inv, e)}
                              className="p-1.5 rounded text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 transition-colors"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          )}

                          {/* Copy Link */}
                          {inv.status === 'Terbit' && inv.active_token && (
                            <button
                              title="Salin Link Penerima"
                              onClick={(e) => handleCopyLink(inv, e)}
                              className="p-1.5 rounded text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 transition-colors"
                            >
                              {copiedId === inv.id ? (
                                <Check className="w-4 h-4 text-emerald-600" />
                              ) : (
                                <Link className="w-4 h-4" />
                              )}
                            </button>
                          )}

                          {/* Cancel Invoice (Owner/Admin only) */}
                          {isOwnerAdmin && inv.status !== 'Dibatalkan' && (
                            <button
                              title="Batalkan Invoice"
                              onClick={() => setCancelTarget(inv)}
                              className="p-1.5 rounded text-rose-600 hover:text-rose-800 hover:bg-rose-50 transition-colors"
                            >
                              <Ban className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Cancellation */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center">
                <Ban className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Konfirmasi Pembatalan Invoice</h3>
            </div>

            <p className="text-xs text-slate-600">
              Anda akan membatalkan invoice{' '}
              <span className="font-bold text-slate-900">
                {cancelTarget.invoice_number || cancelTarget.id}
              </span>
              . Tindakan ini akan mencabut seluruh tautan akses penerima dan PDF publik. Nomor invoice
              yang dibatalkan tidak akan digunakan kembali.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Alasan Pembatalan:
              </label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Contoh: Kesepakatan proyek dibatalkan oleh klien..."
                rows={3}
                className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setCancelTarget(null);
                  setCancelReason('');
                }}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Tutup
              </button>
              <button
                disabled={!cancelReason.trim()}
                onClick={() => {
                  if (cancelTarget && cancelReason.trim()) {
                    onCancelInvoice(cancelTarget.id, cancelReason.trim());
                    setCancelTarget(null);
                    setCancelReason('');
                  }
                }}
                className="px-4 py-2 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 disabled:opacity-50"
              >
                Ya, Batalkan Invoice
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
