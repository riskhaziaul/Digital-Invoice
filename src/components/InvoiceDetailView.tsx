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
  ExternalLink,
  Eye,
  MessageSquare,
  RefreshCw,
  CornerUpLeft,
} from 'lucide-react';
import { Invoice, PaymentRecord, UserProfile } from '../types';
import { formatRupiah, formatTanggalIndonesia } from '../lib/terbilang';
import { generateInvoicePDF } from '../lib/pdf-generator';
import { formatInvoiceMessage } from '../lib/message-formatter';
import { dataService } from '../lib/data-service';

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

  // Share Message Modal
  const [showShareModal, setShowShareModal] = useState(false);
  const [selectedTemplateType, setSelectedTemplateType] = useState<string>('pengiriman_invoice');
  const [oneTimeMessageText, setOneTimeMessageText] = useState('');
  const [copiedMessage, setCopiedMessage] = useState(false);

  const v = invoice.current_version;
  const client = v.client_snapshot;

  const validPayments = invoice.payments.filter((p) => !p.is_reversed);
  const totalPaid = validPayments.reduce((sum, p) => sum + p.amount, 0);
  const remainingBalance = Math.max(0, v.grand_total - totalPaid);

  const isOwnerAdmin = currentUser.role === 'OWNER' || currentUser.role === 'ADMIN';
  const isStaff = currentUser.role === 'STAFF';

  const recipientUrl = invoice.active_token
    ? `${window.location.origin}/invoice/${invoice.active_token}`
    : '';

  const recipientPDFUrl = invoice.active_token
    ? `${window.location.origin}/invoice/${invoice.active_token}/pdf`
    : '';

  // Download PDF directly
  const handleDownloadPDF = async () => {
    try {
      const pdfBytes = await generateInvoicePDF({
        invoiceNumber: invoice.invoice_number || 'DRAFT',
        version: v,
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
    if (!isOwnerAdmin) return;
    setIsProcessing(true);
    try {
      const res = await dataService.publishInvoice(invoice.id);
      alert(res.message);
      if (res.success) onRefresh();
    } finally {
      setIsProcessing(false);
    }
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

  // Open Share Modal & Prepare Template
  const handleOpenShareModal = () => {
    const templates = dataService.getTemplates();
    const tpl = templates.find((t) => t.type === selectedTemplateType) || templates[0];
    if (tpl) {
      const formatted = formatInvoiceMessage(tpl.body, invoice, currentUser.full_name);
      setOneTimeMessageText(formatted.text);
    }
    setShowShareModal(true);
  };

  const handleTemplateChange = (type: string) => {
    setSelectedTemplateType(type);
    const templates = dataService.getTemplates();
    const tpl = templates.find((t) => t.type === type) || templates[0];
    if (tpl) {
      const formatted = formatInvoiceMessage(tpl.body, invoice, currentUser.full_name);
      setOneTimeMessageText(formatted.text);
    }
  };

  // Check unresolved placeholders in one-time edited message
  const unresolvedMatches = oneTimeMessageText.match(/\{[a-zA-Z0-9_]+\}/g) || [];
  const hasUnresolved = unresolvedMatches.length > 0;

  const handleCopyOneTimeMessage = () => {
    if (hasUnresolved) {
      alert(`Pesan masih mengandung placeholder yang belum terisi: ${unresolvedMatches.join(', ')}`);
      return;
    }
    navigator.clipboard.writeText(oneTimeMessageText);
    setCopiedMessage(true);
    setTimeout(() => setCopiedMessage(false), 2000);
  };

  // WhatsApp open
  const handleOpenWhatsApp = () => {
    if (hasUnresolved) {
      alert(`Pesan masih mengandung placeholder yang belum terisi: ${unresolvedMatches.join(', ')}`);
      return;
    }
    if (!client.whatsapp) {
      alert('Nomor WhatsApp klien belum diisi.');
      return;
    }
    let cleanPhone = client.whatsapp.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('0')) cleanPhone = '62' + cleanPhone.slice(1);
    else if (cleanPhone.startsWith('8')) cleanPhone = '62' + cleanPhone;

    const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(oneTimeMessageText)}`;
    window.open(waUrl, '_blank');
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
              className="px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs"
            >
              <FileEdit className="w-4 h-4" />
              Edit Draft
            </button>
          )}

          {/* Diajukan: Owner/Admin can Approve or Return */}
          {invoice.status === 'Diajukan' && isOwnerAdmin && (
            <>
              <button
                disabled={isProcessing}
                onClick={handlePublish}
                className="px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" />
                {isProcessing ? 'Menerbitkan...' : 'Setujui & Terbitkan'}
              </button>
              <button
                onClick={() => setShowReturnModal(true)}
                className="px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
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
                onClick={handleOpenShareModal}
                className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs"
              >
                <MessageSquare className="w-4 h-4" />
                Bagikan Pesan
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
              className="px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold flex items-center gap-1.5"
            >
              <Copy className="w-4 h-4 text-slate-500" />
              Duplikasi
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

      {/* Public Share Links Card (Only if Terbit and Token Active) */}
      {invoice.status === 'Terbit' && invoice.active_token && (
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link className="w-4 h-4 text-indigo-600" />
              <h3 className="text-xs font-bold text-slate-900">Tautan Akses Klien Resmi</h3>
            </div>
            {isOwnerAdmin && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRegenerateToken}
                  className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold"
                >
                  Buat Ulang Link
                </button>
                <span className="text-slate-300">|</span>
                <button
                  onClick={handleRevokeToken}
                  className="text-[11px] text-rose-600 hover:text-rose-800 font-semibold"
                >
                  Cabut Akses
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Invoice Link */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
              <div className="truncate mr-2">
                <span className="text-[10px] text-slate-400 font-bold block uppercase">
                  Halaman Invoice
                </span>
                <span className="text-xs text-slate-800 font-mono truncate block">
                  {recipientUrl}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={handleCopyLink}
                  className="p-1.5 rounded-md bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                  title="Salin Link"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <a
                  href={recipientUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1.5 rounded-md bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                  title="Buka Tab Baru"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            {/* Direct PDF Link */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
              <div className="truncate mr-2">
                <span className="text-[10px] text-slate-400 font-bold block uppercase">
                  Tautan Langsung PDF
                </span>
                <span className="text-xs text-slate-800 font-mono truncate block">
                  {recipientPDFUrl}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={handleCopyPDFLink}
                  className="p-1.5 rounded-md bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                  title="Salin Link PDF"
                >
                  {copiedPDFLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={handleDownloadPDF}
                  className="p-1.5 rounded-md bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                  title="Unduh Langsung"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
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
                    {item.description}
                  </td>
                  <td className="py-2.5 px-3 text-center">{item.quantity}</td>
                  <td className="py-2.5 px-3">{item.unit || '-'}</td>
                  <td className="py-2.5 px-3 text-right">{formatRupiah(item.unit_price)}</td>
                  <td className="py-2.5 px-3 text-right font-bold">{formatRupiah(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

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
            {v.client_notes && (
              <div>
                <span className="text-[11px] font-bold text-slate-900 uppercase tracking-wider block mb-1">
                  Catatan:
                </span>
                <p className="text-slate-600 whitespace-pre-line">{v.client_notes}</p>
              </div>
            )}
            <div className="mt-4 text-right sm:text-left">
              <p className="text-slate-500">Hormat Kami,</p>
              <p className="font-bold text-slate-900 mt-6">{v.publisher_snapshot.name}</p>
            </div>
          </div>
        </div>
      </div>

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

      {/* Share Message & WhatsApp Modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-xl max-w-xl w-full p-6 shadow-xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">Kirim & Bagikan Pesan</h3>
              </div>
              <button
                onClick={() => setShowShareModal(false)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Pilih Jenis Template:
                </label>
                <select
                  value={selectedTemplateType}
                  onChange={(e) => handleTemplateChange(e.target.value)}
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                >
                  <option value="pengiriman_invoice">Pengiriman Invoice Standar</option>
                  <option value="pengingat_sebelum_jatuh_tempo">Pengingat Sebelum Jatuh Tempo</option>
                  <option value="pengingat_setelah_jatuh_tempo">Pengingat Setelah Jatuh Tempo</option>
                  <option value="konfirmasi_pembayaran">Konfirmasi Pembayaran Diterima</option>
                  <option value="pengiriman_revisi">Pengiriman Revisi Resmi</option>
                </select>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Isi Pesan (Dapat Diedit Sekali Kirim):
                  </label>
                  <span className="text-[11px] text-slate-400">
                    Pengeditan di sini tidak merubah template utama
                  </span>
                </div>
                <textarea
                  rows={6}
                  value={oneTimeMessageText}
                  onChange={(e) => setOneTimeMessageText(e.target.value)}
                  className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-lg font-sans leading-relaxed focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>

              {hasUnresolved && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Perhatian: </span>
                    Pesan masih mengandung placeholder yang belum terisi:{' '}
                    <span className="font-mono">{unresolvedMatches.join(', ')}</span>. Harap lengkapi
                    sebelum menyalin atau mengirim.
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100">
              <span className="text-[11px] text-slate-500">
                Penerima WhatsApp: <span className="font-bold">{client.whatsapp || 'Belum diisi'}</span>
              </span>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  disabled={hasUnresolved}
                  onClick={handleCopyOneTimeMessage}
                  className="w-full sm:w-auto px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40"
                >
                  {copiedMessage ? (
                    <Check className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                  {copiedMessage ? 'Tersalin!' : 'Salin Pesan'}
                </button>

                <button
                  type="button"
                  disabled={hasUnresolved || !client.whatsapp}
                  onClick={handleOpenWhatsApp}
                  className="w-full sm:w-auto px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 shadow-xs"
                >
                  <Share2 className="w-4 h-4" />
                  Buka WhatsApp
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
