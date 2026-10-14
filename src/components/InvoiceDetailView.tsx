import React, { useState } from 'react';
import {
  ArrowLeft,
  Download,
  Share2,
  Copy,
  Link,
  Check,
  CheckCircle2,
  AlertCircle,
  Clock,
  RotateCcw,
  CreditCard,
  Ban,
  FileEdit,
  FileText,
  Send,
  ExternalLink,
  Eye,
  MessageSquare,
  Mail,
  RefreshCw,
  CornerUpLeft,
  Cloud,
  Globe,
  Paperclip,
  DollarSign,
} from 'lucide-react';
import { Invoice, InvoiceAttachment, PaymentRecord, UserProfile } from '../types';
import { formatRupiah, formatUSD, formatTanggalIndonesia, formatAngka, getExchangeRatesSummary } from '../lib/terbilang';
import { generateInvoicePDF } from '../lib/pdf-generator';
import { dataService } from '../lib/data-service';
import { uploadFileToDrive } from '../lib/google-drive';
import { SendMessageModal } from './SendMessageModal';
import { AttachmentManager } from './AttachmentManager';
import { InvoiceDeliveryFormat } from '../lib/message-formatter';

interface InvoiceDetailViewProps {
  invoice: Invoice;
  currentUser: UserProfile;
  onBack: () => void;
  onEditDraft: (invoiceId: string) => void;
  onDuplicate: (invoiceId: string) => void;
  onRefresh: () => void;
}

export const InvoiceDetailView: React.FC<InvoiceDetailViewProps> = ({
  invoice,
  currentUser,
  onBack,
  onEditDraft,
  onDuplicate,
  onRefresh,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedPDFLink, setCopiedPDFLink] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Return modal
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnNotes, setReturnNotes] = useState('');

  // Payment modal
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState('Transfer Bank blu by BCA Digital');
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  // Payment Reversal modal
  const [reversalTarget, setReversalTarget] = useState<PaymentRecord | null>(null);
  const [reversalReason, setReversalReason] = useState('');

  // Send Message & Email Notification Modal
  const [sendModalChannel, setSendModalChannel] = useState<'whatsapp' | 'email' | null>(null);
  const [sendModalFormat, setSendModalFormat] = useState<InvoiceDeliveryFormat>('both');

  // Google Drive state
  const [isSavingToDrive, setIsSavingToDrive] = useState(false);
  const [driveSuccessLink, setDriveSuccessLink] = useState<string | null>(null);

  const v = invoice.current_version;
  const client = v.client_snapshot;

  const validPayments = invoice.payments.filter((p) => !p.is_reversed);
  const totalPaid = validPayments.reduce((sum, p) => sum + p.amount, 0);
  const remainingBalance = Math.max(0, v.grand_total - totalPaid);

  const isOwnerAdmin = currentUser.role === 'OWNER' || currentUser.role === 'ADMIN';
  const isStaff = currentUser.role === 'STAFF';

  const handleAttachmentsChange = (updated: InvoiceAttachment[]) => {
    dataService.updateInvoiceAttachments(invoice.id, updated);
    onRefresh();
  };

  const recipientUrl = invoice.active_token
    ? `${window.location.origin}/invoice/${invoice.active_token}`
    : `${window.location.origin}/invoice/${invoice.id}`;

  const recipientPDFUrl = invoice.active_token
    ? `${window.location.origin}/invoice/${invoice.active_token}/pdf`
    : `${window.location.origin}/invoice/${invoice.id}/pdf`;

  // Download PDF directly
  const handleDownloadPDF = async () => {
    try {
      const atts = v.attachments || invoice.attachments || [];
      const pdfBytes = await generateInvoicePDF({
        invoiceNumber: invoice.invoice_number || 'DRAFT',
        version: v,
        attachments: atts,
        createdByName: invoice.created_by_name || v.created_by_name,
      });
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeNumber = (invoice.invoice_number || 'DRAFT').replace(/[^a-zA-Z0-9]/g, '_');
      const safeCompany = (client.company_name || 'Client').replace(/[^a-zA-Z0-9]/g, '_');
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

  // Save PDF directly to Google Drive
  const handleSaveToDrive = async () => {
    setIsSavingToDrive(true);
    setDriveSuccessLink(null);
    try {
      const atts = v.attachments || invoice.attachments || [];
      const pdfBytes = await generateInvoicePDF({
        invoiceNumber: invoice.invoice_number || 'DRAFT',
        version: v,
        attachments: atts,
        createdByName: invoice.created_by_name || v.created_by_name,
      });
      const safeNumber = (invoice.invoice_number || 'DRAFT').replace(/[^a-zA-Z0-9]/g, '_');
      const safeCompany = (client.company_name || 'Client').replace(/[^a-zA-Z0-9]/g, '_');
      const fileName = `Invoice_${safeNumber}_${safeCompany}_v${invoice.revision_number}.pdf`;

      const uploaded = await uploadFileToDrive({
        name: fileName,
        mimeType: 'application/pdf',
        content: pdfBytes,
        description: `Invoice ${invoice.invoice_number} untuk ${client.company_name}. Total: Rp ${v.grand_total.toLocaleString('id-ID')}`,
      });

      dataService.recordAuditLog(
        'INVOICE',
        invoice.id,
        `Menyimpan salinan PDF ${fileName} ke Google Drive`
      );

      if (uploaded.webViewLink) {
        setDriveSuccessLink(uploaded.webViewLink);
      }
      alert(`Berhasil menyimpan berkas "${fileName}" ke folder "Invoice Digital" di Google Drive!`);
    } catch (err: any) {
      console.error('Google Drive save error:', err);
      alert(err.message || 'Gagal menyimpan ke Google Drive. Pastikan popup login Google tidak diblokir.');
    } finally {
      setIsSavingToDrive(false);
    }
  };

  const handleCopyLink = () => {
    if (!recipientUrl) return;
    navigator.clipboard.writeText(recipientUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyPDFLink = () => {
    if (!recipientPDFUrl) return;
    navigator.clipboard.writeText(recipientPDFUrl);
    setCopiedPDFLink(true);
    setTimeout(() => setCopiedPDFLink(false), 2000);
  };

  // Publish
  const handlePublish = async () => {
    if (!isOwnerAdmin) {
      alert('Hanya Owner atau Admin yang berwenang menerbitkan invoice.');
      return;
    }
    setIsProcessing(true);
    try {
      const res = await dataService.publishInvoice(invoice.id);
      alert(res.message);
      if (res.success) onRefresh();
    } catch (err: any) {
      console.error('Error saat menerbitkan invoice:', err);
      alert('Terjadi kesalahan saat memproses penerbitan: ' + (err?.message || 'Error tidak diketahui'));
    } finally {
      setIsProcessing(false);
    }
  };

  // Submit Draft for Approval (Staff)
  const handleSubmitForApproval = () => {
    const res = dataService.submitDraftForApproval(invoice.id);
    alert(res.message);
    if (res.success) onRefresh();
  };

  // Return
  const handleReturn = () => {
    if (!returnNotes.trim()) {
      alert('Catatan pengembalian wajib diisi.');
      return;
    }
    const res = dataService.returnSubmission(invoice.id, returnNotes);
    alert(res.message);
    if (res.success) {
      setShowReturnModal(false);
      onRefresh();
    }
  };

  // Withdraw
  const handleWithdraw = () => {
    const res = dataService.withdrawSubmission(invoice.id);
    alert(res.message);
    if (res.success) onRefresh();
  };

  // Record Payment
  const handleSavePayment = () => {
    if (paymentAmount <= 0) {
      alert('Nominal pembayaran harus lebih dari nol.');
      return;
    }
    if (paymentAmount > remainingBalance) {
      alert(`Nominal tidak boleh melebihi sisa tagihan (${formatRupiah(remainingBalance)}).`);
      return;
    }
    const res = dataService.recordPayment(invoice.id, {
      amount: paymentAmount,
      paymentDate,
      paymentMethod,
      referenceNumber: paymentRef,
      notes: paymentNotes,
    });
    alert(res.message);
    if (res.success) {
      setShowPaymentModal(false);
      setPaymentAmount(0);
      setPaymentRef('');
      setPaymentNotes('');
      onRefresh();
    }
  };

  // Reverse Payment
  const handleConfirmReversal = () => {
    if (!reversalTarget || !reversalReason.trim()) {
      alert('Alasan pembatalan pembayaran wajib diisi.');
      return;
    }
    const res = dataService.reversePayment(invoice.id, reversalTarget.id, reversalReason);
    alert(res.message);
    if (res.success) {
      setReversalTarget(null);
      setReversalReason('');
      onRefresh();
    }
  };

  // Regenerate Token
  const handleRegenerateToken = async () => {
    if (!confirm('Apakah Anda yakin ingin mencabut tautan lama dan membuat tautan penerima baru? Tautan sebelumnya tidak akan dapat diakses lagi.')) {
      return;
    }
    const res = await dataService.regenerateShareToken(invoice.id);
    alert(res.message);
    if (res.success) onRefresh();
  };

  // Revoke Token
  const handleRevokeToken = () => {
    if (!confirm('Apakah Anda yakin ingin mencabut akses link penerima? Halaman dan PDF tidak akan dapat diakses oleh publik.')) {
      return;
    }
    const res = dataService.revokeShareToken(invoice.id);
    alert(res.message);
    if (res.success) onRefresh();
  };

  // Create Revision
  const handleCreateRevision = () => {
    if (totalPaid > 0) {
      // Prompt reminder regarding recorded payments
      if (!confirm(`Invoice ini telah memiliki pembayaran tercatat sebesar ${formatRupiah(totalPaid)}. Pembuatan revisi tidak boleh membuat total tagihan baru lebih kecil dari pembayaran yang telah diterima. Lanjutkan?`)) {
        return;
      }
    }
    const res = dataService.createRevisionDraft(invoice.id);
    alert(res.message);
    if (res.success && res.invoice) {
      onEditDraft(res.invoice.id);
    }
  };

  // Open Send Message / Notification Modal
  const handleOpenSendModal = (channel: 'whatsapp' | 'email' = 'whatsapp', format: InvoiceDeliveryFormat = 'both') => {
    setSendModalChannel(channel);
    setSendModalFormat(format);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Bar Navigation */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            title="Kembali"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                {invoice.invoice_number || 'DRAFT INVOICE'}
              </h1>
              {invoice.revision_number > 1 && (
                <span className="px-2 py-0.5 rounded text-xs font-bold bg-purple-100 text-purple-900">
                  Revisi Ke-{invoice.revision_number - 1}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Dibuat oleh {invoice.created_by_name} pada {formatTanggalIndonesia(invoice.created_at)}
            </p>
          </div>
        </div>

        {/* Action Buttons based on status & role */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Draft or Dikembalikan: can Edit */}
          {(invoice.status === 'Draft' || invoice.status === 'Dikembalikan') && (
            <button
              onClick={() => onEditDraft(invoice.id)}
              className="px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <FileEdit className="w-4 h-4" />
              Edit Draft
            </button>
          )}

          {/* Draft: Owner/Admin can Publish directly */}
          {invoice.status === 'Draft' && isOwnerAdmin && (
            <button
              disabled={isProcessing}
              onClick={handlePublish}
              className="px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              {isProcessing ? 'Menerbitkan...' : 'Terbitkan Invoice'}
            </button>
          )}

          {/* Draft: Staff can submit for approval */}
          {invoice.status === 'Draft' && isStaff && (
            <button
              disabled={isProcessing}
              onClick={handleSubmitForApproval}
              className="px-3.5 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <Send className="w-4 h-4" />
              Ajukan untuk Persetujuan
            </button>
          )}

          {/* Diajukan: Owner/Admin can Approve or Return */}
          {invoice.status === 'Diajukan' && isOwnerAdmin && (
            <>
              <button
                disabled={isProcessing}
                onClick={handlePublish}
                className="px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                {isProcessing ? 'Menerbitkan...' : 'Setujui & Terbitkan'}
              </button>
              <button
                onClick={() => setShowReturnModal(true)}
                className="px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <CornerUpLeft className="w-4 h-4" />
                Kembalikan
              </button>
            </>
          )}

          {/* Diajukan: Staff can Withdraw */}
          {invoice.status === 'Diajukan' && isStaff && (
            <button
              onClick={handleWithdraw}
              className="px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold flex items-center gap-1.5"
            >
              <RotateCcw className="w-4 h-4 text-slate-500" />
              Tarik Pengajuan ke Draft
            </button>
          )}

          {/* Terbit Actions */}
          {invoice.status === 'Terbit' && (
            <>
              <button
                onClick={handleDownloadPDF}
                className="px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs"
              >
                <Download className="w-4 h-4" />
                Unduh PDF
              </button>

              <button
                onClick={handleSaveToDrive}
                disabled={isSavingToDrive}
                className="px-3 py-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
                title="Simpan salinan resmi PDF ke Google Drive"
              >
                <Cloud className={`w-4 h-4 text-blue-600 ${isSavingToDrive ? 'animate-pulse' : ''}`} />
                {isSavingToDrive ? 'Menyimpan...' : 'Simpan ke Drive'}
              </button>

              {driveSuccessLink && (
                <a
                  href={driveSuccessLink}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Lihat di Drive
                </a>
              )}

              <button
                onClick={() => handleOpenSendModal('whatsapp')}
                className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                title="Kirim pesan penagihan langsung via WhatsApp"
              >
                <MessageSquare className="w-4 h-4" />
                Kirim WhatsApp
              </button>

              <button
                onClick={() => handleOpenSendModal('email')}
                className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                title="Kirim email notifikasi invoice ke klien"
              >
                <Mail className="w-4 h-4" />
                Kirim Email
              </button>

              {isOwnerAdmin && (
                <button
                  onClick={() => {
                    setPaymentAmount(remainingBalance);
                    setShowPaymentModal(true);
                  }}
                  disabled={remainingBalance === 0}
                  className="px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                >
                  <CreditCard className="w-4 h-4" />
                  Catat Pembayaran
                </button>
              )}

              {currentUser.role !== 'VIEWER' && (
                <button
                  onClick={handleCreateRevision}
                  className="px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold flex items-center gap-1.5"
                >
                  <RefreshCw className="w-4 h-4 text-slate-500" />
                  Buat Revisi
                </button>
              )}
            </>
          )}

          {/* Duplicate always allowed except viewer */}
          {currentUser.role !== 'VIEWER' && (
            <button
              onClick={() => onDuplicate(invoice.id)}
              className="px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              title="Duplikat dokumen ini dengan nomor invoice baru dan tanggal bulan berjalan"
            >
              <Copy className="w-4 h-4 text-slate-500" />
              Duplikasi Invoice
            </button>
          )}
        </div>
      </div>

      {/* Return Notes Banner if Dikembalikan */}
      {invoice.status === 'Dikembalikan' && invoice.return_notes && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="text-xs">
            <h4 className="font-bold text-amber-900">Dokumen Dikembalikan untuk Revisi</h4>
            <p className="text-amber-800 mt-1 whitespace-pre-line">{invoice.return_notes}</p>
          </div>
        </div>
      )}

      {/* Official PDF & Web Link Dispatch Card (Only if Terbit) */}
      {invoice.status === 'Terbit' && (
        <div className="bg-white p-5 rounded-xl border border-indigo-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-900">Pilihan Pengiriman Tagihan (Link & PDF)</h3>
                <p className="text-[11px] text-slate-500">Kirimkan invoice ke klien dalam format Tautan Online, Berkas PDF Resmi, atau Lengkap (Keduanya)</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleOpenSendModal('whatsapp', 'both')}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                title="Kirim via WhatsApp (Lengkap Link + PDF)"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Kirim via WA</span>
              </button>
              <button
                onClick={() => handleOpenSendModal('email', 'both')}
                className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                title="Kirim via Email (Lengkap Link + PDF)"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>Kirim via Email</span>
              </button>
            </div>
          </div>

          {/* Dual Format Grid: Link vs PDF */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Format 1: Tautan Web Interaktif */}
            <div className="p-3.5 bg-blue-50/50 border border-blue-200 rounded-xl space-y-2.5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-950 flex items-center gap-1.5">
                    <Globe className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>Format 1: Tautan Web (Link Online)</span>
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-semibold">
                    Interaktif
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 mt-1">
                  Klien membuka portal web untuk rincian interaktif, konfirmasi pembayaran, dan unduhan mandiri.
                </p>
                {recipientUrl && (
                  <div className="mt-2 text-[10px] font-mono text-blue-700 bg-white p-1.5 rounded border border-blue-200 truncate select-all">
                    {recipientUrl}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1.5 pt-2 border-t border-blue-200/70 flex-wrap">
                <button
                  onClick={handleCopyLink}
                  className="px-2.5 py-1 rounded bg-white hover:bg-slate-100 text-slate-700 text-[11px] font-semibold border border-slate-200 flex items-center gap-1 transition-colors cursor-pointer"
                  title="Salin tautan online invoice"
                >
                  <Copy className="w-3 h-3" />
                  <span>{copiedLink ? 'Tersalin' : 'Salin Link'}</span>
                </button>
                {recipientUrl && (
                  <a
                    href={recipientUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1 rounded bg-white hover:bg-slate-100 text-blue-700 text-[11px] font-semibold border border-blue-200 flex items-center gap-1 transition-colors"
                    title="Buka portal penerima di tab baru"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Buka Portal</span>
                  </a>
                )}
                <button
                  onClick={() => handleOpenSendModal('whatsapp', 'link')}
                  className="ml-auto px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer shadow-xs"
                  title="Kirim hanya link via WhatsApp"
                >
                  <MessageSquare className="w-3 h-3" />
                  <span>Kirim Link via WA</span>
                </button>
              </div>
            </div>

            {/* Format 2: Dokumen Berkas PDF Resmi */}
            <div className="p-3.5 bg-indigo-50/50 border border-indigo-200 rounded-xl space-y-2.5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>Format 2: Berkas Lampiran PDF</span>
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 font-semibold">
                    Dokumen Resmi
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 mt-1">
                  Berkas PDF resmi untuk dilampirkan langsung ke chat WhatsApp atau Email tanpa kendala akses link.
                </p>
                <div className="mt-2 text-[10px] font-mono text-slate-700 bg-white p-1.5 rounded border border-indigo-200 truncate">
                  {`Invoice_${(invoice.invoice_number || 'DRAFT').replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`}
                </div>
              </div>

              <div className="flex items-center gap-1.5 pt-2 border-t border-indigo-200/70 flex-wrap">
                <button
                  onClick={handleDownloadPDF}
                  className="px-2.5 py-1 rounded bg-white hover:bg-slate-100 text-indigo-700 text-[11px] font-semibold border border-indigo-200 flex items-center gap-1 transition-colors cursor-pointer"
                  title="Unduh berkas PDF resmi ke perangkat Anda"
                >
                  <Download className="w-3 h-3" />
                  <span>Unduh PDF</span>
                </button>
                <button
                  onClick={() => handleOpenSendModal('whatsapp', 'pdf')}
                  className="ml-auto px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer shadow-xs"
                  title="Kirim berkas PDF via WhatsApp"
                >
                  <MessageSquare className="w-3 h-3" />
                  <span>Kirim PDF via WA</span>
                </button>
              </div>
            </div>
          </div>

          {/* Client Contacts Bar */}
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate-700">Tujuan Kontak:</span>
              <span className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200">
                <span className="text-[10px] text-slate-400 uppercase font-bold">WhatsApp:</span>
                <span className="font-mono text-slate-800 font-medium">{client.whatsapp || '(Belum diisi)'}</span>
              </span>
              <span className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200">
                <span className="text-[10px] text-slate-400 uppercase font-bold">Email:</span>
                <span className="font-mono text-slate-800 font-medium">{client.email || '(Belum diisi)'}</span>
              </span>
            </div>

            {isOwnerAdmin && invoice.active_token && (
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  onClick={handleCopyPDFLink}
                  className="text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
                  title="Salin Tautan PDF"
                >
                  <Copy className="w-3 h-3" />
                  <span>{copiedPDFLink ? 'Tersalin' : 'Salin Tautan PDF'}</span>
                </button>
                <span className="text-slate-300">|</span>
                <button
                  onClick={handleRegenerateToken}
                  className="text-slate-500 hover:text-slate-700 font-medium"
                >
                  Perbarui Token
                </button>
                <span className="text-slate-300">|</span>
                <button
                  onClick={handleRevokeToken}
                  className="text-rose-600 hover:text-rose-800 font-medium"
                >
                  Cabut Akses
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Invoice Document Review */}
      <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-md space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start border-b border-slate-200 pb-6 gap-4">
          <div>
            {v.logo_snapshot_url ? (
              <img
                src={v.logo_snapshot_url}
                alt="Logo"
                className="max-h-14 max-w-44 object-contain mb-2"
              />
            ) : (
              <h2 className="text-xl font-black text-slate-900 tracking-tight">
                {v.publisher_snapshot.name}
              </h2>
            )}
            <p className="text-xs text-slate-500 font-medium">
              {v.publisher_snapshot.city}, {v.publisher_snapshot.country}
            </p>
            <p className="text-xs text-slate-500">
              Telp: {v.publisher_snapshot.phone} | Email: {v.publisher_snapshot.email}
            </p>
          </div>

          <div className="text-left sm:text-right w-full sm:w-auto">
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">
              INVOICE DIGITAL TEAM
            </h2>
            <table className="text-xs text-slate-700 sm:ml-auto mt-2">
              <tbody>
                <tr>
                  <td className="text-slate-400 pr-2">Nomor Invoice:</td>
                  <td className="font-bold text-slate-900">{invoice.invoice_number || 'DRAFT'}</td>
                </tr>
                <tr>
                  <td className="text-slate-400 pr-2">Tanggal Terbit:</td>
                  <td className="font-medium">{formatTanggalIndonesia(v.issue_date)}</td>
                </tr>
                <tr>
                  <td className="text-slate-400 pr-2">Jatuh Tempo:</td>
                  <td className="font-medium">{formatTanggalIndonesia(v.due_date)}</td>
                </tr>
                <tr>
                  <td className="text-slate-400 pr-2">Periode:</td>
                  <td className="font-medium">{v.period || '-'}</td>
                </tr>
                <tr>
                  <td className="text-slate-400 pr-2 pt-1.5 align-top">Ket. Pembayaran:</td>
                  <td className="pt-1.5">
                    {isOwnerAdmin ? (
                      <select
                        value={invoice.payment_status || 'Belum Bayar'}
                        onChange={(e) => {
                          const val = e.target.value as any;
                          const res = dataService.updateInvoicePaymentStatus(invoice.id, val);
                          alert(res.message);
                          if (res.success) onRefresh();
                        }}
                        className={`text-xs font-bold py-0.5 px-2 rounded border cursor-pointer ${
                          invoice.payment_status === 'Sudah di bayar'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            : invoice.payment_status === 'Dibayar sebagian'
                            ? 'bg-blue-50 text-blue-800 border-blue-300'
                            : invoice.payment_status === 'dibatalkan'
                            ? 'bg-rose-50 text-rose-800 border-rose-300'
                            : 'bg-amber-50 text-amber-900 border-amber-300'
                        }`}
                        title="Klik untuk mengubah keterangan pembayaran invoice"
                      >
                        <option value="Belum Bayar">Belum Bayar</option>
                        <option value="Dibayar sebagian">Dibayar sebagian</option>
                        <option value="Sudah di bayar">Sudah di bayar</option>
                        <option value="dibatalkan">dibatalkan</option>
                      </select>
                    ) : (
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                          invoice.payment_status === 'Sudah di bayar'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : invoice.payment_status === 'Dibayar sebagian'
                            ? 'bg-blue-100 text-blue-800 border border-blue-300'
                            : invoice.payment_status === 'dibatalkan'
                            ? 'bg-rose-100 text-rose-800 border border-rose-300'
                            : 'bg-amber-100 text-amber-900 border border-amber-300'
                        }`}
                      >
                        {invoice.payment_status || 'Belum Bayar'}
                      </span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Ditagihkan Kepada */}
        <div>
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Ditagihkan Kepada:
          </span>
          <p className="text-sm font-bold text-slate-900 mt-1">
            {client.sapaan} {client.pic_name}
          </p>
          <p className="text-xs font-semibold text-slate-800">{client.company_name}</p>
          <p className="text-xs text-slate-600 whitespace-pre-line mt-0.5">
            {client.billing_address || '-'}
          </p>
          {(client.whatsapp || client.email) && (
            <p className="text-xs text-slate-500 mt-1">
              {client.whatsapp && `WA: ${client.whatsapp}`} {client.email && `| Email: ${client.email}`}
            </p>
          )}
        </div>

        {/* Item Table */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs text-left text-slate-800">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3 w-12 text-center">No.</th>
                <th className="py-2.5 px-3">Deskripsi Pekerjaan</th>
                <th className="py-2.5 px-3 w-20 text-center">Qty</th>
                <th className="py-2.5 px-3 w-24">Satuan</th>
                <th className="py-2.5 px-3 w-32 text-right">Harga Satuan</th>
                <th className="py-2.5 px-3 w-32 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {v.items.map((item, idx) => (
                <tr key={item.id || idx}>
                  <td className="py-2.5 px-3 text-center text-slate-400">{idx + 1}</td>
                  <td className="py-2.5 px-3 font-medium whitespace-pre-line">
                    <span>{item.description}</span>
                    {item.currency === 'USD' && (
                      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-emerald-800 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 w-fit">
                        <DollarSign className="w-3 h-3 text-emerald-600" />
                        <span>USD (Valas) • Kurs: Rp {formatAngka(item.custom_exchange_rate || v.custom_exchange_rate || 16250)} / $1</span>
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-center">{item.quantity}</td>
                  <td className="py-2.5 px-3">{item.unit || '-'}</td>
                  <td className="py-2.5 px-3 text-right">
                    {item.currency === 'USD' ? (
                      <div>
                        <span className="font-bold text-slate-900">{formatUSD(item.unit_price_usd || 0)}</span>
                        <span className="text-[10px] text-slate-500 block">({formatRupiah(item.unit_price)})</span>
                      </div>
                    ) : (
                      formatRupiah(item.unit_price)
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold">
                    {item.currency === 'USD' ? (
                      <div>
                        <span className="text-slate-900">{formatRupiah(item.total)}</span>
                        <span className="text-[10px] text-emerald-700 font-semibold block">{formatUSD(item.total_usd || 0)}</span>
                      </div>
                    ) : (
                      formatRupiah(item.total)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Valas Info Callout if USD items exist */}
        {v.items.some((i) => i.currency === 'USD' || (i.unit_price_usd && i.unit_price_usd > 0)) && (
          <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-lg text-xs text-emerald-900 flex items-start gap-2.5">
            <DollarSign className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Informasi Kurs Valuta Asing (USD):</span>
              <p className="text-[11px] text-emerald-800 mt-0.5">
                Dokumen ini memuat komponen dengan denominasi US Dollar (USD) sebesar{' '}
                <strong>
                  {formatUSD(
                    v.items.reduce((s, i) => s + (i.currency === 'USD' ? (Number(i.total_usd) || 0) : 0), 0)
                  )}
                </strong>
                . Nilai konversi resmi ke Rupiah dihitung berdasarkan kurs custom yang disepakati (Kurs acuan:{' '}
                {getExchangeRatesSummary(v.items, v.custom_exchange_rate)}).
              </p>
            </div>
          </div>
        )}

        {/* Totals */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-start pt-2">
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
              Terbilang:
            </span>
            <p className="text-xs font-semibold italic text-slate-800 leading-relaxed">
              "{v.terbilang}"
            </p>
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">Subtotal:</span>
              <span className="font-semibold text-slate-900">{formatRupiah(v.subtotal)}</span>
            </div>
            {v.discount_amount > 0 && (
              <div className="flex justify-between py-1 border-b border-slate-100 text-amber-800">
                <span>
                  Diskon ({v.discount_type === 'percent' ? `${v.discount_value}%` : 'Nominal'}):
                </span>
                <span>- {formatRupiah(v.discount_amount)}</span>
              </div>
            )}
            {v.tax_enabled && (
              <div className="flex justify-between py-1 border-b border-slate-100 text-slate-700">
                <span>Pajak ({v.tax_rate}%):</span>
                <span>+ {formatRupiah(v.tax_amount)}</span>
              </div>
            )}
            <div className="flex justify-between py-2 border-t-2 border-slate-900 font-bold text-sm text-slate-900">
              <span>Grand Total:</span>
              <span>{formatRupiah(v.grand_total)}</span>
            </div>
          </div>
        </div>

        {/* General Clauses (Klausul Umum Utuh) */}
        {(() => {
          let clauses = v.general_clauses || [];
          if (clauses.length === 0 && v.client_notes && v.client_notes.includes('Item tambahan akan dikenakan biaya tambahan')) {
            clauses = [
              {
                id: 'clause-default-1',
                title: 'General Clause',
                content: '1. Item tambahan akan dikenakan biaya tambahan\n2. Biaya Tambahan akan ditagih langsung, di luar tagihan utama',
                is_active: true,
              },
            ];
          }
          const activeClauses = clauses.filter((c) => c.is_active !== false);
          if (activeClauses.length === 0) return null;

          return (
            <div className="pt-4 border-t border-slate-200 text-xs">
              <span className="text-[11px] font-bold text-slate-900 uppercase tracking-wider block mb-2">
                Klausul Umum / General Clauses (Syarat & Ketentuan):
              </span>
              <div className="bg-slate-50/80 p-3.5 rounded-lg border border-slate-200 space-y-2">
                {activeClauses.map((clause, cIdx) => (
                  <div key={clause.id || cIdx} className="text-slate-800">
                    <p className="font-bold text-slate-900">
                      {cIdx + 1}. {clause.title || `Klausul ${cIdx + 1}`}:
                    </p>
                    <p className="text-slate-700 whitespace-pre-line pl-4 mt-0.5 leading-relaxed">
                      {clause.content}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Bank & Notes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-slate-200 text-xs">
          <div>
            <span className="text-[11px] font-bold text-slate-900 uppercase tracking-wider block mb-1">
              Rekening Pembayaran:
            </span>
            <p className="text-slate-700 font-medium">Bank: {v.bank_snapshot.bank_name}</p>
            <p className="text-slate-900 font-bold text-sm">
              No. Rekening: {v.bank_snapshot.account_number}
            </p>
            <p className="text-slate-700 font-medium">A.N: {v.bank_snapshot.account_name}</p>
            {v.payment_terms && (
              <p className="text-slate-500 mt-2 whitespace-pre-line text-[11px]">
                {v.payment_terms}
              </p>
            )}
          </div>

          <div>
            {v.client_notes &&
              !v.client_notes.includes('Item tambahan akan dikenakan biaya tambahan') &&
              v.client_notes.trim().toLowerCase() !== 'general clause' && (
                <div>
                  <span className="text-[11px] font-bold text-slate-900 uppercase tracking-wider block mb-1">
                    Catatan:
                  </span>
                  <p className="text-slate-600 whitespace-pre-line leading-relaxed">{v.client_notes}</p>
                </div>
              )}
            <div className="mt-4 text-right sm:text-left space-y-1">
              <p className="text-slate-500 font-medium">Hormat Kami,</p>
              <div className="h-12" />
              <p className="font-bold text-slate-900 border-b border-slate-300 pb-0.5 inline-block min-w-36">
                {(invoice.created_by_name || v.created_by_name || 'Riskha Ziaulhusna').replace(/\s*\((Owner|Admin|Staff|Viewer)\)/gi, '').trim()}
              </p>
            </div>
          </div>
        </div>

        {/* Lampiran Dokumen di Invoice */}
        <div className="pt-4 border-t border-slate-200 text-xs">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[11px] font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <Paperclip className="w-3.5 h-3.5 text-blue-600" />
              Lampiran Dokumen Resmi:
            </span>
            <span className="text-[11px] text-slate-500 font-medium">
              {(v.attachments || invoice.attachments || []).length > 0
                ? `${(v.attachments || invoice.attachments || []).length} berkas terlampir`
                : 'Tidak ada lampiran'}
            </span>
          </div>

          {(v.attachments || invoice.attachments || []).length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {(v.attachments || invoice.attachments || []).map((att, idx) => (
                <div
                  key={att.id || idx}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0 pr-2">
                    <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 truncate text-[11px]" title={att.name}>
                        {att.name}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        <span className="font-bold text-blue-700">[{att.category}]</span>{' '}
                        {att.size ? `• ${(att.size / 1024).toFixed(0)} KB` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {att.data_url && (
                      <a
                        href={att.data_url}
                        download={att.name}
                        className="p-1 rounded text-slate-600 hover:text-slate-900 hover:bg-white transition-colors"
                        title="Unduh Lampiran"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    )}
                    {att.drive_web_link && (
                      <a
                        href={att.drive_web_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 rounded text-blue-600 hover:text-blue-800 hover:bg-white transition-colors"
                        title="Buka di Google Drive"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-400 italic text-[11px]">
              Tidak ada berkas lampiran pendukung yang disertakan pada invoice ini.
            </p>
          )}
        </div>
      </div>

      {/* Lampiran Dokumen Pendukung (Attachments) */}
      <AttachmentManager
        title="Lampiran Dokumen Pendukung (Attachments)"
        subtitle="Dokumen resmi pendukung invoice: PO / Surat Pesanan, BAST, SPK/Kontrak, Bukti Pekerjaan, dan Faktur Pajak"
        attachments={v.attachments || invoice.attachments || []}
        onChange={handleAttachmentsChange}
        readOnly={currentUser.role === 'VIEWER'}
        canUpload={currentUser.role !== 'VIEWER'}
        canDelete={currentUser.role !== 'VIEWER'}
        currentUserName={currentUser.full_name}
        invoiceNumber={invoice.invoice_number || 'INVOICE'}
        showGoogleDriveSync={true}
      />

      {/* Ringkasan Pembayaran & Riwayat Transaksi */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Ringkasan Pembayaran Terkini</h3>
            <p className="text-[11px] text-slate-500">
              Pembayaran dicatat terpisah dan tidak mengubah file PDF arsip terbit.
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs text-slate-500">Sisa Tagihan:</span>
            <p className="text-base font-bold text-slate-900">{formatRupiah(remainingBalance)}</p>
          </div>
        </div>

        {invoice.payments.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">
            Belum ada pembayaran yang dicatat untuk invoice ini.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {invoice.payments.map((p) => (
              <div key={p.id} className="py-3 flex items-center justify-between text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-bold ${
                        p.is_reversed ? 'line-through text-slate-400' : 'text-slate-900'
                      }`}
                    >
                      {formatRupiah(p.amount)}
                    </span>
                    <span className="text-slate-500">• {formatTanggalIndonesia(p.payment_date)}</span>
                    <span className="text-slate-500">• {p.payment_method}</span>
                    {p.is_reversed && (
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-100 text-rose-800">
                        DIBATALKAN (REVERSED)
                      </span>
                    )}
                  </div>
                  {(p.reference_number || p.referenceNumber) && (
                    <p className="text-[11px] text-slate-400 mt-0.5">Ref: {p.reference_number || p.referenceNumber}</p>
                  )}
                  {p.notes && <p className="text-[11px] text-slate-600 mt-0.5">{p.notes}</p>}
                  {p.is_reversed && p.reversal_reason && (
                    <p className="text-[11px] text-rose-600 mt-0.5 italic">
                      Alasan Reversal: {p.reversal_reason} (oleh {p.reversed_by_name || 'Admin'})
                    </p>
                  )}
                </div>

                {isOwnerAdmin && !p.is_reversed && (
                  <button
                    onClick={() => setReversalTarget(p)}
                    className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 px-2 py-1 rounded hover:bg-rose-50"
                  >
                    Batalkan Pembayaran
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Return Modal */}
      {showReturnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Kembalikan Pengajuan Invoice</h3>
            <p className="text-xs text-slate-600">
              Berikan catatan perbaikan kepada pembuat draft mengenai hal-hal yang perlu disesuaikan.
            </p>
            <textarea
              rows={4}
              value={returnNotes}
              onChange={(e) => setReturnNotes(e.target.value)}
              placeholder="Tuliskan catatan perbaikan di sini..."
              className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowReturnModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700"
              >
                Batal
              </button>
              <button
                onClick={handleReturn}
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold"
              >
                Kembalikan Draft
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Recording Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-slate-900" />
              <h3 className="text-base font-bold text-slate-900">Catat Pembayaran Masuk</h3>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
              <div className="flex justify-between text-slate-600">
                <span>Grand Total:</span>
                <span className="font-bold text-slate-900">{formatRupiah(v.grand_total)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Telah Dibayar:</span>
                <span className="font-bold text-emerald-700">{formatRupiah(totalPaid)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Sisa Tagihan:</span>
                <span className="font-bold text-amber-900">{formatRupiah(remainingBalance)}</span>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nominal Pembayaran (Rp) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max={remainingBalance}
                  value={paymentAmount || ''}
                  onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Tanggal Pembayaran <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Metode Pembayaran</label>
                <input
                  type="text"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nomor Referensi Transfer</label>
                <input
                  type="text"
                  placeholder="Contoh: BLU-20260921-987"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Catatan</label>
                <textarea
                  rows={2}
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowPaymentModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700"
              >
                Batal
              </button>
              <button
                onClick={handleSavePayment}
                className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold"
              >
                Simpan Pembayaran
              </button>
            </div>
          </div>
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
                {formatRupiah(reversalTarget.amount)}
              </span>
              . Tindakan ini tercatat di riwayat audit dan tidak menghapus data tanpa jejak.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Alasan Pembatalan <span className="text-rose-500">*</span>:
              </label>
              <textarea
                rows={3}
                value={reversalReason}
                onChange={(e) => setReversalReason(e.target.value)}
                placeholder="Contoh: Bukti transfer salah / duplikasi input..."
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

      {/* Send Message & Email Notification Modal */}
      {sendModalChannel && (
        <SendMessageModal
          invoice={invoice}
          currentUser={currentUser}
          initialChannel={sendModalChannel}
          initialFormat={sendModalFormat}
          onClose={() => setSendModalChannel(null)}
          onSuccess={() => onRefresh()}
        />
      )}
    </div>
  );
};
