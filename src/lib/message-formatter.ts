import { Invoice } from '../types';
import { formatRupiah, formatTanggalIndonesia } from './terbilang';

export type InvoiceDeliveryFormat = 'link' | 'pdf' | 'both';

export interface FormattedMessageResult {
  text: string;
  hasUnresolvedPlaceholders: boolean;
  unresolvedKeys: string[];
  linkInvoice: string;
  linkPDF: string;
  pdfFileName: string;
  invoiceFormat: InvoiceDeliveryFormat;
  whatsappUrl?: string;
}

export function cleanWhatsAppNumber(phone: string): string {
  if (!phone) return '';
  let clean = phone.replace(/[^0-9]/g, '');
  if (clean.startsWith('0')) {
    clean = '62' + clean.slice(1);
  } else if (clean.startsWith('8')) {
    clean = '62' + clean;
  }
  return clean;
}

export interface FormattedEmailResult {
  subject: string;
  body: string;
  to: string;
  mailtoUrl: string;
  gmailWebUrl: string;
  linkInvoice: string;
  linkPDF: string;
  pdfFileName: string;
  invoiceFormat: InvoiceDeliveryFormat;
}

export function formatInvoiceEmail(
  templateBody: string,
  invoice: Invoice,
  senderName: string,
  customSubject?: string,
  baseUrl: string = window.location.origin,
  invoiceFormat: InvoiceDeliveryFormat = 'both'
): FormattedEmailResult {
  const v = invoice.current_version;
  const client = v.client_snapshot;

  const totalPaid = invoice.payments
    .filter((p) => !p.is_reversed)
    .reduce((sum, p) => sum + p.amount, 0);

  const remainingBalance = Math.max(0, v.grand_total - totalPaid);

  const linkInvoice = invoice.active_token
    ? `${baseUrl}/invoice/${invoice.active_token}`
    : `${baseUrl}/invoice/${invoice.id}`;

  const linkPDF = invoice.active_token
    ? `${baseUrl}/invoice/${invoice.active_token}/pdf`
    : `${baseUrl}/invoice/${invoice.id}/pdf`;

  const pdfFileName = `Invoice_${(invoice.invoice_number || 'DRAFT').replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;

  // Format the core message text using placeholder replacement and chosen format
  const msgResult = formatInvoiceMessage(templateBody, invoice, senderName, baseUrl, invoiceFormat);

  const subject = customSubject || `[INVOICE] Tagihan ${invoice.invoice_number || 'DRAFT'} - ${client.company_name || client.pic_name || 'Klien'}`;

  const salutation = [client.sapaan, client.pic_name].filter(Boolean).join(' ') || 'Bapak/Ibu Rekanan';

  let formatSection = '';
  if (invoiceFormat === 'link') {
    formatSection = `Akses Invoice Online:
------------------------------------------
Tautan Portal Web: ${linkInvoice}
Keterangan       : Silakan buka tautan di atas untuk melihat rincian tagihan interaktif dan dokumen penagihan.`;
  } else if (invoiceFormat === 'pdf') {
    formatSection = `Lampiran Dokumen Resmi:
------------------------------------------
Berkas Terlampir : ${pdfFileName}
Keterangan       : Dokumen resmi tagihan invoice dilampirkan dalam format PDF (attachment).`;
  } else {
    formatSection = `Akses & Lampiran Dokumen Invoice:
------------------------------------------
Tautan Portal Web: ${linkInvoice}
Berkas Terlampir : ${pdfFileName} (PDF)
Keterangan       : Anda dapat membuka portal web di atas atau mengunduh berkas PDF resmi terlampir.`;
  }

  const body = `Kepada Yth.
${salutation}
${client.company_name ? client.company_name + '\n' : ''}
Dengan hormat,

${msgResult.text}

Rincian Tagihan Invoice:
------------------------------------------
Nomor Invoice    : ${invoice.invoice_number || 'DRAFT'}
Tanggal Terbit   : ${formatTanggalIndonesia(v.issue_date)}
Jatuh Tempo      : ${formatTanggalIndonesia(v.due_date)}
Total Tagihan    : ${formatRupiah(v.grand_total)}
Pembayaran Masuk : ${formatRupiah(totalPaid)}
Sisa Tagihan     : ${formatRupiah(remainingBalance)}

Instruksi Pembayaran:
------------------------------------------
Bank             : ${v.bank_snapshot?.bank_name || 'blu by BCA Digital'}
Nomor Rekening   : ${v.bank_snapshot?.account_number || '000480500229'}
Atas Nama        : ${v.bank_snapshot?.account_name || 'Riskha Ziaulhusna'}

${formatSection}

Jika pembayaran telah dilakukan, mohon kirimkan konfirmasi atau bukti transfer melalui balasan email ini.
Atas kerja sama dan kepercayaan yang diberikan, kami ucapkan terima kasih.

Hormat kami,
${senderName || v.publisher_snapshot?.name || 'DIGITAL / MARCOMM TEAM'}`;

  const to = client.email || '';
  const mailtoUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const gmailWebUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return {
    subject,
    body,
    to,
    mailtoUrl,
    gmailWebUrl,
    linkInvoice,
    linkPDF,
    pdfFileName,
    invoiceFormat,
  };
}

export function formatInvoiceMessage(
  templateBody: string,
  invoice: Invoice,
  senderName: string,
  baseUrl: string = window.location.origin,
  invoiceFormat: InvoiceDeliveryFormat = 'both'
): FormattedMessageResult {
  const v = invoice.current_version;
  const client = v.client_snapshot;

  const totalPaid = invoice.payments
    .filter((p) => !p.is_reversed)
    .reduce((sum, p) => sum + p.amount, 0);

  const remainingBalance = Math.max(0, v.grand_total - totalPaid);

  const linkInvoice = invoice.active_token
    ? `${baseUrl}/invoice/${invoice.active_token}`
    : `${baseUrl}/invoice/${invoice.id}`;

  const linkPDF = invoice.active_token
    ? `${baseUrl}/invoice/${invoice.active_token}/pdf`
    : `${baseUrl}/invoice/${invoice.id}/pdf`;

  const pdfFileName = `Invoice_${(invoice.invoice_number || 'DRAFT').replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;

  // Define dynamic text for placeholders based on format choice
  let linkInvoiceText = linkInvoice;
  let linkPDFText = linkPDF;
  let attachmentText = `berkas dokumen resmi PDF (${pdfFileName})`;

  if (invoiceFormat === 'link') {
    linkInvoiceText = linkInvoice;
    linkPDFText = linkPDF;
    attachmentText = `tautan web invoice online (${linkInvoice})`;
  } else if (invoiceFormat === 'pdf') {
    linkInvoiceText = `berkas PDF resmi terlampir (${pdfFileName})`;
    linkPDFText = `berkas PDF resmi terlampir (${pdfFileName})`;
    attachmentText = `berkas PDF resmi terlampir (${pdfFileName})`;
  } else {
    // both
    linkInvoiceText = linkInvoice;
    linkPDFText = linkPDF;
    attachmentText = `tautan online (${linkInvoice}) serta berkas PDF terlampir (${pdfFileName})`;
  }

  const replacements: Record<string, string> = {
    '{Sapaan}': client.sapaan || '',
    '{Nama}': client.pic_name || '',
    '{Perusahaan}': client.company_name || '',
    '{NomorInvoice}': invoice.invoice_number || 'DRAFT',
    '{TanggalInvoice}': formatTanggalIndonesia(v.issue_date),
    '{JatuhTempo}': formatTanggalIndonesia(v.due_date),
    '{Periode}': v.period || '',
    '{GrandTotal}': formatRupiah(v.grand_total),
    '{PembayaranDiterima}': formatRupiah(totalPaid),
    '{SisaTagihan}': formatRupiah(remainingBalance),
    '{LinkInvoice}': linkInvoiceText,
    '{LinkPDF}': linkPDFText,
    '{LampiranPDF}': attachmentText,
    '{AttachmentPDF}': attachmentText,
    '{NamaPengirim}': senderName || v.publisher_snapshot.name || 'DIGITAL / MARCOMM TEAM',
  };

  let formatted = templateBody;
  for (const [placeholder, val] of Object.entries(replacements)) {
    formatted = formatted.split(placeholder).join(val);
  }

  // If the template body didn't explicitly include link or pdf note, append helpful note based on format
  if (invoiceFormat === 'link') {
    if (!formatted.includes(linkInvoice)) {
      formatted += `\n\nTautan Invoice Online:\n${linkInvoice}`;
    }
  } else if (invoiceFormat === 'pdf') {
    if (!formatted.includes(pdfFileName) && !formatted.toLowerCase().includes('terlampir')) {
      formatted += `\n\nBerkas PDF resmi tagihan terlampir: ${pdfFileName}`;
    }
  } else if (invoiceFormat === 'both') {
    const hasLink = formatted.includes(linkInvoice);
    const hasPdf = formatted.includes(pdfFileName) || formatted.toLowerCase().includes('terlampir');
    if (!hasLink && !hasPdf) {
      formatted += `\n\nTautan Online: ${linkInvoice}\nBerkas PDF: ${pdfFileName} (terlampir)`;
    } else if (!hasLink) {
      formatted += `\n\nTautan Online: ${linkInvoice}`;
    } else if (!hasPdf) {
      formatted += `\n\nBerkas PDF: ${pdfFileName} (terlampir)`;
    }
  }

  // Detect any remaining {xyz} placeholders
  const match = formatted.match(/\{[a-zA-Z0-9_]+\}/g);
  const unresolvedKeys = match ? Array.from(new Set(match)) : [];
  const hasUnresolvedPlaceholders = unresolvedKeys.length > 0;

  // WhatsApp normalization
  let whatsappUrl: string | undefined = undefined;
  if (client.whatsapp) {
    let cleanPhone = client.whatsapp.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '62' + cleanPhone.slice(1);
    } else if (cleanPhone.startsWith('8')) {
      cleanPhone = '62' + cleanPhone;
    }
    whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(formatted)}`;
  }

  return {
    text: formatted,
    hasUnresolvedPlaceholders,
    unresolvedKeys,
    linkInvoice,
    linkPDF,
    pdfFileName,
    invoiceFormat,
    whatsappUrl,
  };
}
