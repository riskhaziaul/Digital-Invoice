import React, { useState, useMemo } from 'react';
import {
  Search,
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
  MoreVertical,
  Check,
  MessageSquare,
  Mail,
  UploadCloud,
  FileSpreadsheet,
  Edit3,
  ChevronDown,
  X,
  AlertTriangle,
} from 'lucide-react';
import { DocumentStatus, Invoice, PaymentStatus, UserProfile } from '../types';
import { formatRupiah, formatTanggalIndonesia } from '../lib/terbilang';
import { generateInvoicePDF } from '../lib/pdf-generator';
import { dataService } from '../lib/data-service';
import { exportInvoicesToCSV, exportInvoicesToJSON } from '../lib/export-import';
import { SendMessageModal } from './SendMessageModal';
import { ImportInvoiceModal } from './ImportInvoiceModal';
import { BulkEditModal } from './BulkEditModal';

interface InvoiceListViewProps {
  invoices: Invoice[];
  currentUser: UserProfile;
  onCreateInvoice: () => void;
  onSelectInvoice: (invoiceId: string) => void;
  onEditDraft: (invoiceId: string) => void;
  onDuplicate: (invoiceId: string) => void;
  onCancelInvoice: (invoiceId: string, reason: string) => void;
  onRefresh?: () => void;
}

export const InvoiceListView: React.FC<InvoiceListViewProps> = ({
  invoices,
  currentUser,
  onCreateInvoice,
  onSelectInvoice,
  onEditDraft,
  onDuplicate,
  onCancelInvoice,
  onRefresh,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDocStatus, setFilterDocStatus] = useState<string>('ALL');
  const [filterPaymentStatus, setFilterPaymentStatus] = useState<string>('ALL');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Selection for bulk operations
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Cancellation modal state
  const [cancelTarget, setCancelTarget] = useState<Invoice | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  // Bulk cancel modal state
  const [showBulkCancelModal, setShowBulkCancelModal] = useState(false);
  const [bulkCancelReason, setBulkCancelReason] = useState('');

  // Send message modal state
  const [sendTarget, setSendTarget] = useState<{ invoice: Invoice; channel: 'whatsapp' | 'email' } | null>(null);

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const v = inv.current_version;
      const client = v?.client_snapshot || {} as any;

      // Search matching: nomor, nama penerima, perusahaan
      const q = searchTerm.toLowerCase();
      const matchSearch =
        !q ||
        (inv.invoice_number && inv.invoice_number.toLowerCase().includes(q)) ||
        (client.pic_name && client.pic_name.toLowerCase().includes(q)) ||
        (client.company_name && client.company_name.toLowerCase().includes(q));

      // Filter Doc Status
      const matchDocStatus = filterDocStatus === 'ALL' || inv.status === filterDocStatus;

      // Filter Payment Status with normalization handling
      let matchPaymentStatus = true;
      if (filterPaymentStatus !== 'ALL') {
        const invStatus = (inv.payment_status || '').toLowerCase();
        const targetStatus = filterPaymentStatus.toLowerCase();

        if (targetStatus === 'sudah di bayar') {
          matchPaymentStatus = invStatus.includes('sudah') || invStatus.includes('lunas');
        } else if (targetStatus === 'dibayar sebagian') {
          matchPaymentStatus = invStatus.includes('sebagian');
        } else if (targetStatus === 'belum bayar') {
          matchPaymentStatus = invStatus.includes('belum');
        } else if (targetStatus === 'dibatalkan') {
          matchPaymentStatus = invStatus.includes('batal') || inv.status === 'Dibatalkan';
        } else {
          matchPaymentStatus = inv.payment_status === filterPaymentStatus;
        }
      }

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

  const isOwnerAdmin = currentUser.role === 'OWNER' || currentUser.role === 'ADMIN';

  const handlePublishInvoice = async (inv: Invoice, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOwnerAdmin) {
      alert('Hanya Owner atau Admin yang berwenang menerbitkan invoice.');
      return;
    }
    const res = await dataService.publishInvoice(inv.id);
    alert(res.message);
    if (res.success && onRefresh) onRefresh();
  };

  const handleDownloadPDF = async (inv: Invoice, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const atts = inv.current_version.attachments || inv.attachments || [];
      const pdfBytes = await generateInvoicePDF({
        invoiceNumber: inv.invoice_number || 'DRAFT',
        version: inv.current_version,
        attachments: atts,
        createdByName: inv.created_by_name || inv.current_version.created_by_name,
      });
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeNumber = (inv.invoice_number || 'DRAFT').replace(/[^a-zA-Z0-9]/g, '_');
      const safeCompany = (inv.current_version.client_snapshot.company_name || 'Client').replace(/[^a-zA-Z0-9]/g, '_');
      a.download = `Invoice_${safeNumber}_${safeCompany}_v${inv.revision_number}.pdf`;
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

  const getPaymentStatusBadge = (status?: PaymentStatus) => {
    const s = (status || '').toLowerCase();
    if (s.includes('sudah') || s.includes('lunas')) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          Sudah di bayar
        </span>
      );
    }
    if (s.includes('sebagian')) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
          Dibayar sebagian
        </span>
      );
    }
    if (s.includes('batal')) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
          dibatalkan
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
        Belum Bayar
      </span>
    );
  };

  // Selection handlers
  const allFilteredSelected =
    filteredInvoices.length > 0 &&
    filteredInvoices.every((inv) => selectedIds.includes(inv.id));

  const handleToggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredInvoices.map((inv) => inv.id));
    }
  };

  const handleToggleSelectRow = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleExportAllCSV = () => {
    exportInvoicesToCSV(invoices, 'Daftar_Invoice_Digital');
    setShowExportMenu(false);
  };

  const handleExportAllJSON = () => {
    exportInvoicesToJSON(invoices, 'Backup_Invoice_Digital');
    setShowExportMenu(false);
  };

  const handleExportSelectedCSV = () => {
    const selectedInvs = invoices.filter((i) => selectedIds.includes(i.id));
    exportInvoicesToCSV(selectedInvs, `Invoice_Terpilih_${selectedInvs.length}`);
  };

  const handleBulkPublish = async () => {
    if (selectedIds.length === 0) return;
    const confirm = window.confirm(`Apakah Anda yakin ingin menerbitkan ${selectedIds.length} invoice sekaligus?`);
    if (!confirm) return;

    const res = await dataService.bulkPublishInvoices(selectedIds);
    alert(res.message);
    if (res.success && onRefresh) onRefresh();
  };

  const handleBulkCancel = () => {
    if (selectedIds.length === 0) return;
    setShowBulkCancelModal(true);
  };

  const handleConfirmBulkCancel = () => {
    if (!bulkCancelReason.trim()) {
      alert('Alasan pembatalan wajib diisi.');
      return;
    }
    const res = dataService.bulkCancelInvoices(selectedIds, bulkCancelReason.trim());
    alert(res.message);
    setShowBulkCancelModal(false);
    setBulkCancelReason('');
    setSelectedIds([]);
    if (res.success && onRefresh) onRefresh();
  };

  const canCreate = currentUser.role !== 'VIEWER';

  return (
    <div className="space-y-6">
      {/* Header & Main Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Daftar Dokumen Invoice</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Kelola data invoice, keterangan pembayaran, bulk edit, serta ekspor-impor berkas.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Import Button */}
          {currentUser.role !== 'VIEWER' && (
            <button
              onClick={() => setShowImportModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold tracking-wide transition-colors shadow-2xs"
              title="Impor invoice dari file Excel (.CSV) atau JSON"
            >
              <UploadCloud className="w-4 h-4 text-blue-600" />
              <span>Import</span>
            </button>
          )}

          {/* Export Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold tracking-wide transition-colors shadow-2xs"
            >
              <Download className="w-4 h-4 text-emerald-600" />
              <span>Export</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {showExportMenu && (
              <div className="absolute right-0 mt-1.5 w-48 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 z-30 text-xs text-slate-700 space-y-0.5">
                <button
                  onClick={handleExportAllCSV}
                  className="w-full text-left px-3.5 py-2 hover:bg-slate-50 flex items-center gap-2 transition-colors"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>Export Excel (.CSV)</span>
                </button>
                <button
                  onClick={handleExportAllJSON}
                  className="w-full text-left px-3.5 py-2 hover:bg-slate-50 flex items-center gap-2 transition-colors"
                >
                  <FileText className="w-4 h-4 text-blue-600" />
                  <span>Export Cadangan (.JSON)</span>
                </button>
              </div>
            )}
          </div>

          {/* Create Button */}
          {canCreate && (
            <button
              id="btn-list-create-invoice"
              onClick={onCreateInvoice}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold tracking-wide transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Buat Invoice Baru</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col md:flex-row gap-3 items-center justify-between shadow-2xs">
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

        <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
          {/* Status Dokumen */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 font-medium">Status Dokumen:</span>
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

          {/* Status Pembayaran (Belum Bayar, Dibayar sebagian, Sudah di bayar, dibatalkan) */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 font-medium">Ket. Pembayaran:</span>
            <select
              value={filterPaymentStatus}
              onChange={(e) => setFilterPaymentStatus(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2 text-slate-800 focus:outline-none font-medium"
            >
              <option value="ALL">Semua Keterangan</option>
              <option value="Belum Bayar">Belum Bayar</option>
              <option value="Dibayar sebagian">Dibayar sebagian</option>
              <option value="Sudah di bayar">Sudah di bayar</option>
              <option value="dibatalkan">dibatalkan</option>
            </select>
          </div>
        </div>
      </div>

      {/* Floating/Sticky Bulk Operations Toolbar when items are selected */}
      {selectedIds.length > 0 && (
        <div className="bg-slate-900 text-white p-3.5 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-lg animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5 text-xs font-semibold">
            <span className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-[11px] font-bold">
              {selectedIds.length}
            </span>
            <span>Invoice Terpilih</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Bulk Duplicate if single selection */}
            {selectedIds.length === 1 && currentUser.role !== 'VIEWER' && (
              <button
                onClick={() => onDuplicate(selectedIds[0])}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors shadow-2xs"
                title="Duplikat invoice terpilih dengan nomor baru dan tanggal bulan berjalan"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Duplikat Invoice</span>
              </button>
            )}

            {/* Bulk Edit Button */}
            {currentUser.role !== 'VIEWER' && (
              <button
                onClick={() => setShowBulkEditModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors shadow-2xs"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Bulk Edit Ket. Bayar</span>
              </button>
            )}

            {/* Bulk Export Selected CSV */}
            <button
              onClick={handleExportSelectedCSV}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors shadow-2xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Terpilih (CSV)</span>
            </button>

            {/* Bulk Publish for Owner/Admin */}
            {isOwnerAdmin && (
              <button
                onClick={handleBulkPublish}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-colors"
                title="Terbitkan semua invoice terpilih yang berstatus draft/diajukan"
              >
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                <span>Terbitkan Terpilih</span>
              </button>
            )}

            {/* Bulk Cancel for Owner/Admin */}
            {isOwnerAdmin && (
              <button
                onClick={handleBulkCancel}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-900/80 hover:bg-rose-800 text-rose-200 border border-rose-700 text-xs font-semibold transition-colors"
                title="Batalkan invoice terpilih"
              >
                <Ban className="w-3.5 h-3.5 text-rose-400" />
                <span>Batalkan Terpilih</span>
              </button>
            )}

            {/* Deselect All */}
            <button
              onClick={() => setSelectedIds([])}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ml-1"
              title="Batal pilih semua"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Invoice Table / Cards */}
      {invoices.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-2xs">
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400 mb-4">
            <FileText className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-800">Belum ada invoice</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1.5 mb-6">
            Database invoice masih kosong. Anda dapat membuat invoice pertama atau mengimpor data massal dari file Excel.
          </p>
          <div className="flex items-center justify-center gap-2">
            {canCreate && (
              <button
                onClick={onCreateInvoice}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold tracking-wide transition-colors shadow-xs"
              >
                <Plus className="w-4 h-4" />
                Buat Invoice Pertama
              </button>
            )}
            {canCreate && (
              <button
                onClick={() => setShowImportModal(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold tracking-wide transition-colors shadow-2xs"
              >
                <UploadCloud className="w-4 h-4 text-blue-600" />
                Import File Excel
              </button>
            )}
          </div>
        </div>
      ) : filteredInvoices.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400 shadow-2xs">
          <p className="text-xs">Tidak ada invoice yang sesuai dengan pencarian atau filter Anda.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={handleToggleSelectAll}
                      className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                      title="Pilih Semua di Halaman Ini"
                    />
                  </th>
                  <th className="py-3 px-3">Nomor Invoice</th>
                  <th className="py-3 px-3">Klien & Perusahaan</th>
                  <th className="py-3 px-3">Tanggal & Jatuh Tempo</th>
                  <th className="py-3 px-3">Total Tagihan</th>
                  <th className="py-3 px-3">Status Dokumen</th>
                  <th className="py-3 px-3">Ket. Pembayaran</th>
                  <th className="py-3 px-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInvoices.map((inv) => {
                  const v = inv.current_version;
                  const client = v?.client_snapshot || ({} as any);
                  const isStaff = currentUser.role === 'STAFF';
                  const isOwnerAdmin = currentUser.role === 'OWNER' || currentUser.role === 'ADMIN';
                  const isSelected = selectedIds.includes(inv.id);

                  return (
                    <tr
                      key={inv.id}
                      onClick={() => onSelectInvoice(inv.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-indigo-50/50 hover:bg-indigo-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      {/* Selection Checkbox */}
                      <td
                        className="py-3.5 px-3 text-center"
                        onClick={(e) => handleToggleSelectRow(inv.id, e)}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>

                      <td className="py-3.5 px-3 font-bold text-slate-900">
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

                      <td className="py-3.5 px-3">
                        <p className="font-semibold text-slate-900">
                          {client.company_name || '(Belum diisi)'}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {client.sapaan} {client.pic_name || '-'}
                        </p>
                      </td>

                      <td className="py-3.5 px-3">
                        <p className="font-medium text-slate-800">
                          {formatTanggalIndonesia(v.issue_date)}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          Jatuh Tempo: {formatTanggalIndonesia(v.due_date)}
                        </p>
                      </td>

                      <td className="py-3.5 px-3 font-bold text-slate-900">
                        {formatRupiah(v.grand_total)}
                        {inv.payments && inv.payments.length > 0 && (
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

                      <td className="py-3.5 px-3">{getDocStatusBadge(inv.status)}</td>

                      <td className="py-3.5 px-3">
                        {getPaymentStatusBadge(inv.payment_status)}
                      </td>

                      <td className="py-3.5 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {/* View detail */}
                          <button
                            title="Lihat Rincian"
                            onClick={() => onSelectInvoice(inv.id)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Draft / Dikembalikan: Edit Draft */}
                          {(inv.status === 'Draft' || inv.status === 'Dikembalikan') &&
                            currentUser.role !== 'VIEWER' && (
                              <button
                                title="Edit Draft"
                                onClick={() => onEditDraft(inv.id)}
                                className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                            )}

                          {/* Duplikat Invoice */}
                          {currentUser.role !== 'VIEWER' && (
                            <button
                              title="Duplikat Invoice (Nomor Baru & Tanggal Bulan Berjalan)"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDuplicate(inv.id);
                              }}
                              className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                          )}

                          {/* Draft: Owner/Admin can publish right here */}
                          {inv.status === 'Draft' && isOwnerAdmin && (
                            <button
                              title="Terbitkan Resmi"
                              onClick={(e) => handlePublishInvoice(inv, e)}
                              className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </button>
                          )}

                          {/* Published Invoice Actions */}
                          {inv.status === 'Terbit' && (
                            <>
                              {inv.active_token && (
                                <button
                                  title="Salin Tautan Akses Online"
                                  onClick={(e) => handleCopyLink(inv, e)}
                                  className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                                >
                                  {copiedId === inv.id ? (
                                    <Check className="w-4 h-4 text-emerald-600" />
                                  ) : (
                                    <Link className="w-4 h-4" />
                                  )}
                                </button>
                              )}

                              <button
                                title="Kirim Penagihan WhatsApp"
                                onClick={() => setSendTarget({ invoice: inv, channel: 'whatsapp' })}
                                className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer"
                              >
                                <MessageSquare className="w-4 h-4" />
                              </button>

                              <button
                                title="Kirim Penagihan Email"
                                onClick={() => setSendTarget({ invoice: inv, channel: 'email' })}
                                className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                              >
                                <Mail className="w-4 h-4" />
                              </button>

                              <button
                                title="Unduh Berkas PDF Resmi"
                                onClick={(e) => handleDownloadPDF(inv, e)}
                                className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                            </>
                          )}

                          {/* Cancel Invoice for Owner/Admin */}
                          {isOwnerAdmin && inv.status !== 'Dibatalkan' && (
                            <button
                              title="Batalkan Invoice"
                              onClick={() => setCancelTarget(inv)}
                              className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 transition-colors cursor-pointer"
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

      {/* Bulk Edit Modal */}
      {showBulkEditModal && (
        <BulkEditModal
          selectedInvoiceIds={selectedIds}
          invoices={invoices}
          onClose={() => setShowBulkEditModal(false)}
          onSuccess={() => {
            setShowBulkEditModal(false);
            setSelectedIds([]);
            if (onRefresh) onRefresh();
          }}
        />
      )}

      {/* Import Modal */}
      {showImportModal && (
        <ImportInvoiceModal
          existingInvoices={invoices}
          onClose={() => setShowImportModal(false)}
          onSuccess={() => {
            setShowImportModal(false);
            if (onRefresh) onRefresh();
          }}
        />
      )}

      {/* Individual Cancellation Confirmation Modal */}
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
              . Tindakan ini akan mencabut seluruh tautan akses penerima dan status pembayaran diatur ke "dibatalkan".
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

      {/* Bulk Cancellation Confirmation Modal */}
      {showBulkCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Konfirmasi Pembatalan Massal</h3>
            </div>

            <p className="text-xs text-slate-600">
              Anda akan membatalkan{' '}
              <span className="font-bold text-slate-900">{selectedIds.length} invoice</span> sekaligus.
              Status pembayaran akan menjadi "dibatalkan" dan tautan akses publik akan dicabut.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Alasan Pembatalan:
              </label>
              <textarea
                value={bulkCancelReason}
                onChange={(e) => setBulkCancelReason(e.target.value)}
                placeholder="Contoh: Pembatalan pesanan periode..."
                rows={3}
                className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setShowBulkCancelModal(false);
                  setBulkCancelReason('');
                }}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Tutup
              </button>
              <button
                disabled={!bulkCancelReason.trim()}
                onClick={handleConfirmBulkCancel}
                className="px-4 py-2 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 disabled:opacity-50"
              >
                Batalkan {selectedIds.length} Invoice
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send WhatsApp / Email Notification Modal */}
      {sendTarget && (
        <SendMessageModal
          invoice={sendTarget.invoice}
          currentUser={currentUser}
          initialChannel={sendTarget.channel}
          onClose={() => setSendTarget(null)}
        />
      )}
    </div>
  );
};
