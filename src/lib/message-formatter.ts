import { Invoice } from '../types';
import { formatRupiah, formatTanggalIndonesia } from './terbilang';

export interface FormattedMessageResult {
  text: string;
  hasUnresolvedPlaceholders: boolean;
  unresolvedKeys: string[];
  linkInvoice: string;
  linkPDF: string;
  whatsappUrl?: string;
}

export function formatInvoiceMessage(
  templateBody: string,
  invoice: Invoice,
  senderName: string,
  baseUrl: string = window.location.origin
): FormattedMessageResult {
  const v = invoice.current_version;
  const client = v.client_snapshot;

  const totalPaid = invoice.payments
    .filter((p) => !p.is_reversed)
    .reduce((sum, p) => sum + p.amount, 0);

  const remainingBalance = Math.max(0, v.grand_total - totalPaid);

  const linkInvoice = invoice.active_token
    ? `${baseUrl}/invoice/${invoice.active_token}`
    : `${baseUrl}/invoice/preview`;

  const linkPDF = invoice.active_token
    ? `${baseUrl}/invoice/${invoice.active_token}/pdf`
    : `${baseUrl}/invoice/preview/pdf`;

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
    '{LinkInvoice}': linkInvoice,
    '{LinkPDF}': linkPDF,
    '{NamaPengirim}': senderName || v.publisher_snapshot.name || 'DIGITAL / MARCOMM TEAM',
  };

  let formatted = templateBody;
  for (const [placeholder, val] of Object.entries(replacements)) {
    formatted = formatted.split(placeholder).join(val);
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
    whatsappUrl,
  };
}
