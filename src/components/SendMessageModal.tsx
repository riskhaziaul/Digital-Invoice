import React, { useState, useMemo } from 'react';
import {
  MessageSquare,
  Mail,
  Send,
  Copy,
  Check,
  ExternalLink,
  AlertCircle,
  X,
  Phone,
  Building2,
  FileText,
  Calendar,
  CheckCircle2,
  Download,
  Paperclip,
  Globe,
  Link2,
} from 'lucide-react';
import { Invoice, UserProfile, MessageTemplate } from '../types';
import { dataService } from '../lib/data-service';
import {
  formatInvoiceMessage,
  formatInvoiceEmail,
  cleanWhatsAppNumber,
  InvoiceDeliveryFormat,
} from '../lib/message-formatter';
import { formatRupiah, formatTanggalIndonesia } from '../lib/terbilang';
import { generateInvoicePDF } from '../lib/pdf-generator';

interface SendMessageModalProps {
  invoice: Invoice;
  currentUser: UserProfile;
  initialChannel?: 'whatsapp' | 'email';
  initialFormat?: InvoiceDeliveryFormat;
  onClose: () => void;
  onSuccess?: (channel: 'whatsapp' | 'email') => void;
}

export const SendMessageModal: React.FC<SendMessageModalProps> = ({
  invoice,
  currentUser,
  initialChannel = 'whatsapp',
  initialFormat = 'both',
  onClose,
  onSuccess,
}) => {
  const [activeChannel, setActiveChannel] = useState<'whatsapp' | 'email'>(initialChannel);
  const [selectedTemplateType, setSelectedTemplateType] = useState<string>('pengiriman_invoice');
  const [deliveryFormat, setDeliveryFormat] = useState<InvoiceDeliveryFormat>(initialFormat);

  const v = invoice.current_version;
  const client = v.client_snapshot;

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const linkInvoice = invoice.active_token
    ? `${baseUrl}/invoice/${invoice.active_token}`
    : `${baseUrl}/invoice/${invoice.id}`;
  const linkPDF = invoice.active_token
    ? `${baseUrl}/invoice/${invoice.active_token}/pdf`
    : `${baseUrl}/invoice/${invoice.id}/pdf`;

  // PDF Attachment State
  const [hasDownloadedPdf, setHasDownloadedPdf] = useState(false);
  const cleanNumber = (invoice.invoice_number || 'DRAFT').replace(/[^a-zA-Z0-9_-]/g, '_');
  const pdfFileName = `Invoice_${cleanNumber}.pdf`;

  // WhatsApp state
  const [whatsappNumber, setWhatsappNumber] = useState(client.whatsapp || '');
  const [waMessageText, setWaMessageText] = useState('');
  const [copiedWa, setCopiedWa] = useState(false);

  // Email state
  const [emailRecipient, setEmailRecipient] = useState(client.email || '');
  const [emailSubject, setEmailSubject] = useState(
    `[INVOICE] Tagihan ${invoice.invoice_number || 'DRAFT'} - ${client.company_name || client.pic_name || 'Klien'}`
  );
  const [emailBodyText, setEmailBodyText] = useState('');
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Feedback banner
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Download PDF Attachment Handler
  const handleDownloadAttachmentPDF = async () => {
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
      a.download = pdfFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setHasDownloadedPdf(true);
      setActionNotice({
        type: 'success',
        text: `Berkas PDF "${pdfFileName}" berhasil diunduh ke perangkat Anda. Siap dilampirkan ke ${activeChannel === 'whatsapp' ? 'WhatsApp' : 'Email'}!`,
      });
    } catch (e) {
      console.error(e);
      setActionNotice({
        type: 'error',
        text: 'Gagal membuat file PDF invoice.',
      });
    }
  };

  // Copy Link Handler
  const handleCopyLink = () => {
    navigator.clipboard.writeText(linkInvoice);
    setCopiedLink(true);
    setActionNotice({
      type: 'success',
      text: 'Tautan web portal invoice online berhasil disalin ke clipboard!',
    });
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Initialize messages when template, active channel, or delivery format changes
  const templates = useMemo(() => dataService.getTemplates(), []);

  const updateMessageContents = (type: string, fmt: InvoiceDeliveryFormat = deliveryFormat) => {
    const tpl = templates.find((t) => t.type === type) || templates[0];
    if (tpl) {
      // Format WhatsApp message
      const formattedWa = formatInvoiceMessage(tpl.body, invoice, currentUser.full_name, baseUrl, fmt);
      setWaMessageText(formattedWa.text);

      // Format Email content
      const formattedEmail = formatInvoiceEmail(tpl.body, invoice, currentUser.full_name, undefined, baseUrl, fmt);
      setEmailSubject(formattedEmail.subject);
      setEmailBodyText(formattedEmail.body);
    }
  };

  // Initial load
  React.useEffect(() => {
    updateMessageContents(selectedTemplateType, deliveryFormat);
  }, [selectedTemplateType, deliveryFormat, invoice]);

  const handleTemplateChange = (type: string) => {
    setSelectedTemplateType(type);
    updateMessageContents(type, deliveryFormat);
  };

  const handleDeliveryFormatChange = (fmt: InvoiceDeliveryFormat) => {
    setDeliveryFormat(fmt);
    updateMessageContents(selectedTemplateType, fmt);
    setActionNotice({
      type: 'success',
      text: fmt === 'link'
        ? 'Format diubah: Menyertakan Tautan Web (Link Online).'
        : fmt === 'pdf'
        ? 'Format diubah: Menyertakan Berkas Lampiran PDF.'
        : 'Format diubah: Menyertakan Lengkap (Tautan Web & Berkas PDF).',
    });
  };

  // WhatsApp Validation
  const normalizedPhone = useMemo(() => cleanWhatsAppNumber(whatsappNumber), [whatsappNumber]);
  const isPhoneValid = normalizedPhone.length >= 9;

  // Detect unresolved placeholders in WhatsApp
  const waUnresolved = useMemo(() => {
    const matches = waMessageText.match(/\{[a-zA-Z0-9_]+\}/g) || [];
    return Array.from(new Set(matches));
  }, [waMessageText]);

  // Detect unresolved placeholders in Email
  const emailUnresolved = useMemo(() => {
    const matches = emailBodyText.match(/\{[a-zA-Z0-9_]+\}/g) || [];
    return Array.from(new Set(matches));
  }, [emailBodyText]);

  // Copy WhatsApp Message
  const handleCopyWhatsApp = () => {
    if (waUnresolved.length > 0) {
      setActionNotice({
        type: 'error',
        text: `Pesan masih memiliki variabel belum terisi: ${waUnresolved.join(', ')}`,
      });
      return;
    }
    navigator.clipboard.writeText(waMessageText);
    setCopiedWa(true);
    setActionNotice({
      type: 'success',
      text: 'Teks pesan WhatsApp berhasil disalin ke clipboard!',
    });
    setTimeout(() => setCopiedWa(false), 2000);
  };

  // Open WhatsApp
  const handleSendWhatsApp = () => {
    if (!isPhoneValid) {
      setActionNotice({
        type: 'error',
        text: 'Nomor WhatsApp belum valid. Masukkan nomor dengan format seperti 08123456789 atau 628123456789.',
      });
      return;
    }
    if (waUnresolved.length > 0) {
      setActionNotice({
        type: 'error',
        text: `Pesan masih memiliki variabel belum terisi: ${waUnresolved.join(', ')}`,
      });
      return;
    }

    const waUrl = `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(waMessageText)}`;
    window.open(waUrl, '_blank');

    dataService.recordAuditLog(
      'INVOICE',
      invoice.id,
      `Mengirim notifikasi invoice (${deliveryFormat.toUpperCase()}) via WhatsApp ke +${normalizedPhone} (${client.pic_name || client.company_name})`
    );

    setActionNotice({
      type: 'success',
      text: `Jendela obrolan WhatsApp dengan +${normalizedPhone} berhasil dibuka.`,
    });

    if (onSuccess) onSuccess('whatsapp');
  };

  // Copy Email Text
  const handleCopyEmail = () => {
    const fullContent = `Subjek: ${emailSubject}\n\n${emailBodyText}`;
    navigator.clipboard.writeText(fullContent);
    setCopiedEmail(true);
    setActionNotice({
      type: 'success',
      text: 'Subjek & isi email berhasil disalin ke clipboard!',
    });
    setTimeout(() => setCopiedEmail(false), 2000);
  };

  // Send via Mailto (Default Mail Client)
  const handleSendMailto = () => {
    if (!emailRecipient || !emailRecipient.includes('@')) {
      setActionNotice({
        type: 'error',
        text: 'Alamat email penerima belum valid.',
      });
      return;
    }

    const mailtoUrl = `mailto:${encodeURIComponent(emailRecipient)}?subject=${encodeURIComponent(
      emailSubject
    )}&body=${encodeURIComponent(emailBodyText)}`;

    window.location.href = mailtoUrl;

    dataService.recordAuditLog(
      'INVOICE',
      invoice.id,
      `Membuka aplikasi email default untuk mengirim invoice (${deliveryFormat.toUpperCase()}) ke ${emailRecipient} (${client.pic_name || client.company_name})`
    );

    setActionNotice({
      type: 'success',
      text: `Membuka aplikasi email ke ${emailRecipient}.`,
    });

    if (onSuccess) onSuccess('email');
  };

  // Send via Gmail Web
  const handleSendGmailWeb = () => {
    if (!emailRecipient || !emailRecipient.includes('@')) {
      setActionNotice({
        type: 'error',
        text: 'Alamat email penerima belum valid.',
      });
      return;
    }

    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
      emailRecipient
    )}&su=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBodyText)}`;

    window.open(gmailUrl, '_blank');

    dataService.recordAuditLog(
      'INVOICE',
      invoice.id,
      `Membuka Gmail Web untuk mengirim notifikasi invoice (${deliveryFormat.toUpperCase()}) ke ${emailRecipient} (${client.pic_name || client.company_name})`
    );

    setActionNotice({
      type: 'success',
      text: `Halaman tulis email Gmail ke ${emailRecipient} berhasil dibuka.`,
    });

    if (onSuccess) onSuccess('email');
  };

  // Download PDF and open WhatsApp
  const handleDownloadAndSendWhatsApp = async () => {
    await handleDownloadAttachmentPDF();
    setTimeout(() => {
      handleSendWhatsApp();
    }, 450);
  };

  // Download PDF and open Gmail Web
  const handleDownloadAndSendGmailWeb = async () => {
    await handleDownloadAttachmentPDF();
    setTimeout(() => {
      handleSendGmailWeb();
    }, 450);
  };

  // Download PDF and open Default Mail Client
  const handleDownloadAndSendMailto = async () => {
    await handleDownloadAttachmentPDF();
    setTimeout(() => {
      handleSendMailto();
    }, 450);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                activeChannel === 'whatsapp'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-blue-100 text-blue-700'
              }`}
            >
              {activeChannel === 'whatsapp' ? (
                <MessageSquare className="w-5 h-5" />
              ) : (
                <Mail className="w-5 h-5" />
              )}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">
                Kirim Notifikasi & Tagihan
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs font-semibold text-slate-700">
                  {invoice.invoice_number || 'DRAFT INVOICE'}
                </span>
                <span className="text-slate-300">•</span>
                <span className="text-xs text-slate-500 truncate max-w-[200px]">
                  {client.company_name || client.pic_name || 'Klien'}
                </span>
                <span className="text-slate-300">•</span>
                <span className="text-xs font-bold text-slate-900">
                  {formatRupiah(v.grand_total)}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
            title="Tutup Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Channel Switcher Tabs */}
        <div className="px-5 pt-3 pb-0 border-b border-slate-100 flex items-center gap-2 bg-white">
          <button
            type="button"
            onClick={() => setActiveChannel('whatsapp')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-lg border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeChannel === 'whatsapp'
                ? 'border-emerald-600 text-emerald-700 bg-emerald-50/60'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <MessageSquare className="w-4 h-4 text-emerald-600" />
            <span>Kirim via WhatsApp</span>
            {client.whatsapp && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 font-medium">
                Siap
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveChannel('email')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-lg border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeChannel === 'email'
                ? 'border-blue-600 text-blue-700 bg-blue-50/60'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Mail className="w-4 h-4 text-blue-600" />
            <span>Kirim via Email Notifikasi</span>
            {client.email && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-800 font-medium">
                Siap
              </span>
            )}
          </button>
        </div>

        {/* Action Notice Notification */}
        {actionNotice && (
          <div
            className={`mx-5 mt-4 p-3 rounded-lg border text-xs font-medium flex items-center justify-between ${
              actionNotice.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            <div className="flex items-center gap-2">
              {actionNotice.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{actionNotice.text}</span>
            </div>
            <button
              onClick={() => setActionNotice(null)}
              className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Modal Scrollable Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Template Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Pilih Jenis Pesan / Template:
            </label>
            <select
              value={selectedTemplateType}
              onChange={(e) => handleTemplateChange(e.target.value)}
              className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-slate-900"
            >
              <option value="pengiriman_invoice">Pengiriman Invoice Standar</option>
              <option value="pengingat_sebelum_jatuh_tempo">Pengingat H-3 Sebelum Jatuh Tempo</option>
              <option value="pengingat_setelah_jatuh_tempo">Pengingat Telah Lewat Jatuh Tempo</option>
              <option value="konfirmasi_pembayaran">Konfirmasi Pembayaran Diterima</option>
              <option value="pengiriman_revisi">Pengiriman Revisi Dokumen Resmi</option>
            </select>
          </div>

          {/* Delivery Format Options: Link, PDF, or Both */}
          <div className="p-3.5 rounded-xl border border-indigo-200 bg-slate-50/70 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <span>Bentuk / Format Invoice yang Dikirim:</span>
              </label>
              <span className="text-[11px] text-slate-500">
                Pilih format yang ingin disertakan ke penerima
              </span>
            </div>

            {/* 3 Option Selection Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleDeliveryFormatChange('link')}
                className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  deliveryFormat === 'link'
                    ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500 text-blue-900 shadow-xs'
                    : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>Tautan Web (Link)</span>
                  </span>
                  {deliveryFormat === 'link' && <Check className="w-3.5 h-3.5 text-blue-600 font-bold" />}
                </div>
                <p className="text-[10px] text-slate-500 mt-1 leading-snug">
                  Klien membuka portal web invoice interaktif secara online
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleDeliveryFormatChange('pdf')}
                className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  deliveryFormat === 'pdf'
                    ? 'bg-indigo-50 border-indigo-500 ring-1 ring-indigo-500 text-indigo-900 shadow-xs'
                    : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span>Berkas Lampiran PDF</span>
                  </span>
                  {deliveryFormat === 'pdf' && <Check className="w-3.5 h-3.5 text-indigo-600 font-bold" />}
                </div>
                <p className="text-[10px] text-slate-500 mt-1 leading-snug">
                  Dokumen berkas PDF resmi terlampir siap unduh & kirim
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleDeliveryFormatChange('both')}
                className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  deliveryFormat === 'both'
                    ? 'bg-emerald-50 border-emerald-500 ring-1 ring-emerald-500 text-emerald-900 shadow-xs'
                    : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Link & Berkas PDF</span>
                  </span>
                  {deliveryFormat === 'both' && <Check className="w-3.5 h-3.5 text-emerald-600 font-bold" />}
                </div>
                <p className="text-[10px] text-slate-500 mt-1 leading-snug">
                  Sertakan tautan online sekaligus lampiran berkas PDF lengkap
                </p>
              </button>
            </div>

            {/* Active Details & Quick Action Box */}
            <div className="pt-2 border-t border-slate-200/80 space-y-2">
              {(deliveryFormat === 'link' || deliveryFormat === 'both') && (
                <div className="p-2.5 bg-white rounded-lg border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Globe className="w-4 h-4 text-blue-600 shrink-0" />
                    <div className="truncate">
                      <span className="font-semibold text-slate-700 mr-1">Tautan Web:</span>
                      <span className="font-mono text-[11px] text-blue-700 select-all">{linkInvoice}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                      title="Salin tautan online invoice"
                    >
                      {copiedLink ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedLink ? 'Tersalin' : 'Salin Link'}</span>
                    </button>
                    <a
                      href={linkInvoice}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-semibold flex items-center gap-1 transition-colors"
                      title="Buka portal penerima di tab baru"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Buka Link</span>
                    </a>
                  </div>
                </div>
              )}

              {(deliveryFormat === 'pdf' || deliveryFormat === 'both') && (
                <div className="p-2.5 bg-white rounded-lg border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                    <div className="truncate">
                      <span className="font-semibold text-slate-700 mr-1">Berkas PDF:</span>
                      <span className="font-mono text-[11px] text-slate-800">{pdfFileName}</span>
                      {hasDownloadedPdf && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
                          Telah Diunduh
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={handleDownloadAttachmentPDF}
                      className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer shadow-xs"
                      title="Unduh berkas PDF invoice resmi"
                    >
                      <Download className="w-3 h-3" />
                      <span>{hasDownloadedPdf ? 'Unduh Ulang' : 'Unduh PDF'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Practical Attachment Steps Guide */}
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex items-start gap-2">
            <span className="font-bold text-slate-800 shrink-0">💡 Petunjuk Pengiriman:</span>
            <span>
              {deliveryFormat === 'link'
                ? 'Pesan otomatis memuat link web portal invoice. Klien dapat langsung mengklik tautan untuk melihat rincian tagihan secara interaktif.'
                : activeChannel === 'whatsapp'
                ? '1. Unduh berkas PDF di atas (atau klik tombol "Unduh PDF & Buka WA"). 2. Pada obrolan WhatsApp, klik tombol lampiran (📎) lalu sertakan berkas PDF yang baru diunduh.'
                : '1. Unduh berkas PDF di atas (atau klik "Unduh PDF & Buka Gmail"). 2. Pada jendela email, klik lampirkan berkas (📎) lalu kirimkan berkas PDF invoice.'}
            </span>
          </div>

          {/* ---------------- WHATSAPP CHANNEL CONTENT ---------------- */}
          {activeChannel === 'whatsapp' && (
            <div className="space-y-4">
              {/* Recipient WhatsApp Phone */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700">
                    Nomor WhatsApp Penerima:
                  </label>
                  <span className="text-[11px] text-slate-400">
                    Format otomatis: 628...
                  </span>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Phone className="w-4 h-4 text-emerald-600" />
                  </div>
                  <input
                    type="text"
                    value={whatsappNumber}
                    onChange={(e) => setWhatsappNumber(e.target.value)}
                    placeholder="Contoh: 08123456789 atau 628123456789"
                    className="w-full pl-9 pr-24 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-600 font-mono"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    {isPhoneValid ? (
                      <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded">
                        +{normalizedPhone}
                      </span>
                    ) : (
                      <span className="text-[10px] text-rose-600 font-medium">Belum lengkap</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Message Body Editor */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700">
                    Teks Pesan WhatsApp:
                  </label>
                  <span className="text-[11px] text-slate-400">
                    {waMessageText.length} karakter
                  </span>
                </div>
                <textarea
                  rows={6}
                  value={waMessageText}
                  onChange={(e) => setWaMessageText(e.target.value)}
                  className="w-full p-3 text-xs bg-slate-50 border border-slate-300 rounded-lg font-sans leading-relaxed focus:outline-none focus:ring-1 focus:ring-emerald-600 text-slate-800"
                />
              </div>

              {waUnresolved.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Perhatian: </span>
                    Masih ada variabel belum terisi:{' '}
                    <span className="font-mono font-bold">{waUnresolved.join(', ')}</span>. Harap lengkapi sebelum mengirim.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ---------------- EMAIL CHANNEL CONTENT ---------------- */}
          {activeChannel === 'email' && (
            <div className="space-y-4">
              {/* Recipient Email Address */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Alamat Email Tujuan:
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Mail className="w-4 h-4 text-blue-600" />
                  </div>
                  <input
                    type="email"
                    value={emailRecipient}
                    onChange={(e) => setEmailRecipient(e.target.value)}
                    placeholder="nama@perusahaan.com"
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600 font-mono"
                  />
                </div>
              </div>

              {/* Email Subject */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Subjek Email:
                </label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600 text-slate-800 font-medium"
                />
              </div>

              {/* Email Body Editor */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700">
                    Isi Notifikasi Email:
                  </label>
                  <span className="text-[11px] text-slate-400">
                    {deliveryFormat === 'link'
                      ? 'Menyertakan rincian tagihan & tautan online portal web'
                      : deliveryFormat === 'pdf'
                      ? 'Menyertakan rincian tagihan & keterangan berkas PDF resmi terlampir'
                      : 'Menyertakan rincian tagihan, tautan web, dan berkas PDF terlampir'}
                  </span>
                </div>
                <textarea
                  rows={8}
                  value={emailBodyText}
                  onChange={(e) => setEmailBodyText(e.target.value)}
                  className="w-full p-3 text-xs bg-slate-50 border border-slate-300 rounded-lg font-mono text-[11px] leading-relaxed focus:outline-none focus:ring-1 focus:ring-blue-600 text-slate-800"
                />
              </div>

              {emailUnresolved.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Perhatian: </span>
                    Ada variabel template yang belum terisi:{' '}
                    <span className="font-mono font-bold">{emailUnresolved.join(', ')}</span>.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            Tercatat otomatis di riwayat audit aktivitas
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
            >
              Tutup
            </button>

            {activeChannel === 'whatsapp' ? (
              <>
                <button
                  type="button"
                  onClick={handleCopyWhatsApp}
                  className="px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Salin teks pesan ke clipboard"
                >
                  {copiedWa ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedWa ? 'Tersalin' : 'Salin Pesan'}</span>
                </button>

                {(deliveryFormat === 'link' || deliveryFormat === 'both') && (
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Salin link portal web saja"
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Link2 className="w-3.5 h-3.5" />}
                    <span>Salin Link Saja</span>
                  </button>
                )}

                {deliveryFormat === 'link' ? (
                  <button
                    type="button"
                    disabled={!isPhoneValid || waUnresolved.length > 0}
                    onClick={handleSendWhatsApp}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                    title="Buka WhatsApp untuk mengirim pesan dengan link invoice"
                  >
                    <Send className="w-4 h-4" />
                    <span>Kirim via WhatsApp</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={!isPhoneValid || waUnresolved.length > 0}
                      onClick={handleSendWhatsApp}
                      className="px-3 py-2 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                      title="Buka WhatsApp langsung tanpa unduh ulang PDF"
                    >
                      <Send className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Buka WA Saja</span>
                    </button>

                    <button
                      type="button"
                      disabled={!isPhoneValid || waUnresolved.length > 0}
                      onClick={handleDownloadAndSendWhatsApp}
                      className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                      title="Unduh file PDF otomatis lalu buka WhatsApp untuk mengirim pesan dan melampirkan berkas"
                    >
                      <Download className="w-4 h-4" />
                      <span>Unduh PDF & Buka WA</span>
                    </button>
                  </>
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleCopyEmail}
                  className="px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Salin subjek & isi email ke clipboard"
                >
                  {copiedEmail ? <Check className="w-3.5 h-3.5 text-blue-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedEmail ? 'Tersalin' : 'Salin Teks'}</span>
                </button>

                {(deliveryFormat === 'link' || deliveryFormat === 'both') && (
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Salin link portal web saja"
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Link2 className="w-3.5 h-3.5" />}
                    <span>Salin Link</span>
                  </button>
                )}

                {deliveryFormat === 'link' ? (
                  <>
                    <button
                      type="button"
                      disabled={!emailRecipient || !emailRecipient.includes('@')}
                      onClick={handleSendGmailWeb}
                      className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                      title="Buka compose email di Gmail Web dengan link invoice"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>Buka di Gmail</span>
                    </button>

                    <button
                      type="button"
                      disabled={!emailRecipient || !emailRecipient.includes('@')}
                      onClick={handleSendMailto}
                      className="p-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
                      title="Buka aplikasi email default perangkat"
                    >
                      <Mail className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={!emailRecipient || !emailRecipient.includes('@')}
                      onClick={handleSendGmailWeb}
                      className="px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                      title="Buka compose email di Gmail Web tanpa unduh ulang PDF"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Buka Gmail Saja</span>
                    </button>

                    <button
                      type="button"
                      disabled={!emailRecipient || !emailRecipient.includes('@')}
                      onClick={handleDownloadAndSendGmailWeb}
                      className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                      title="Unduh file PDF otomatis lalu buka compose email di Gmail Web"
                    >
                      <Download className="w-4 h-4" />
                      <span>Unduh PDF & Buka Gmail</span>
                    </button>

                    <button
                      type="button"
                      disabled={!emailRecipient || !emailRecipient.includes('@')}
                      onClick={handleDownloadAndSendMailto}
                      className="p-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
                      title="Kirim via Aplikasi Email Default (Unduh PDF & Buka Mail)"
                    >
                      <Mail className="w-4 h-4" />
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
