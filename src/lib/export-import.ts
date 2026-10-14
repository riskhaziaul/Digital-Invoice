import { Invoice, InvoiceItem, PaymentStatus, normalizePaymentStatus } from '../types';
import { formatTanggalIndonesia, formatRupiah, angkaKeTerbilang } from './terbilang';
import { dataService } from './data-service';

export interface CSVExportRow {
  nomor_invoice: string;
  status_dokumen: string;
  keterangan_pembayaran: string;
  tanggal_terbit: string;
  tanggal_jatuh_tempo: string;
  periode: string;
  nama_pic: string;
  perusahaan: string;
  email: string;
  whatsapp: string;
  alamat_penagihan: string;
  subtotal: number;
  diskon: number;
  pajak_ppn: number;
  grand_total: number;
  total_terbayar: number;
  sisa_tagihan: number;
  tautan_online: string;
  catatan: string;
}

export interface ImportParsedItem {
  rowNumber: number;
  raw: Record<string, string>;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  companyName: string;
  picName: string;
  email: string;
  whatsapp: string;
  billingAddress: string;
  items: { description: string; quantity: number; unit: string; unitPrice: number; total: number }[];
  grandTotal: number;
  paymentStatus: 'Belum Bayar' | 'Dibayar sebagian' | 'Sudah di bayar' | 'dibatalkan';
  documentStatus: 'Draft' | 'Terbit' | 'Diajukan' | 'Dibatalkan';
  notes: string;
  isValid: boolean;
  validationErrors: string[];
  existsInDb: boolean;
  existingId?: string;
}

// Helper to escape CSV cell value
function escapeCSVCell(val: any): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

// Download blob helper
export function triggerFileDownload(content: string | Blob, filename: string, mimeType: string) {
  const blob = typeof content === 'string' ? new Blob([content], { type: mimeType }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Export Invoices to CSV with UTF-8 BOM
export function exportInvoicesToCSV(invoices: Invoice[], filenamePrefix = 'Daftar_Invoice'): void {
  const headers = [
    'Nomor Invoice',
    'Status Dokumen',
    'Keterangan Pembayaran',
    'Tanggal Terbit',
    'Jatuh Tempo',
    'Periode Tagihan',
    'Perusahaan Klien',
    'Nama PIC',
    'Email Klien',
    'WhatsApp Klien',
    'Alamat Penagihan',
    'Subtotal (Rp)',
    'Diskon (Rp)',
    'PPN (Rp)',
    'Grand Total (Rp)',
    'Total Terbayar (Rp)',
    'Sisa Tagihan (Rp)',
    'Tautan Akses Online',
    'Catatan / Terms',
  ];

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const rows = invoices.map((inv) => {
    const v = inv.current_version;
    const client = v?.client_snapshot || ({} as any);
    const validPayments = (inv.payments || []).filter((p) => !p.is_reversed);
    const totalPaid = validPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const grandTotal = Number(v?.grand_total) || 0;
    const remaining = Math.max(0, grandTotal - totalPaid);

    const tokenLink = inv.active_token
      ? `${baseUrl}/invoice/${inv.active_token}`
      : `${baseUrl}/invoice/${inv.id}`;

    const ketBayar = normalizePaymentStatus(inv.payment_status, inv.status);

    return [
      escapeCSVCell(inv.invoice_number || 'DRAFT'),
      escapeCSVCell(inv.status),
      escapeCSVCell(ketBayar),
      escapeCSVCell(v?.issue_date || ''),
      escapeCSVCell(v?.due_date || ''),
      escapeCSVCell(v?.period || ''),
      escapeCSVCell(client?.company_name || ''),
      escapeCSVCell(`${client?.sapaan || ''} ${client?.pic_name || ''}`.trim()),
      escapeCSVCell(client?.email || ''),
      escapeCSVCell(client?.whatsapp || ''),
      escapeCSVCell(client?.billing_address || ''),
      escapeCSVCell(v?.subtotal || 0),
      escapeCSVCell(v?.discount_amount || 0),
      escapeCSVCell(v?.tax_amount || 0),
      escapeCSVCell(grandTotal),
      escapeCSVCell(totalPaid),
      escapeCSVCell(remaining),
      escapeCSVCell(tokenLink),
      escapeCSVCell(v?.client_notes || v?.payment_terms || ''),
    ].join(',');
  });

  // UTF-8 BOM prefix (\uFEFF) ensures Excel displays Indonesian accents, currencies, and headers accurately
  const csvContent = '\uFEFF' + [headers.map(escapeCSVCell).join(','), ...rows].join('\r\n');
  const dateStr = new Date().toISOString().slice(0, 10);
  triggerFileDownload(csvContent, `${filenamePrefix}_${dateStr}.csv`, 'text/csv;charset=utf-8;');
}

// Export Invoices to JSON
export function exportInvoicesToJSON(invoices: Invoice[], filenamePrefix = 'Backup_Invoices'): void {
  const jsonContent = JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      app: 'Invoice Digital Pro',
      version: '2.0',
      total_invoices: invoices.length,
      invoices,
    },
    null,
    2
  );
  const dateStr = new Date().toISOString().slice(0, 10);
  triggerFileDownload(jsonContent, `${filenamePrefix}_${dateStr}.json`, 'application/json;charset=utf-8;');
}

// Download Sample CSV Template
export function downloadCSVTemplate(): void {
  const headers = [
    'Nomor Invoice',
    'Tanggal Terbit (YYYY-MM-DD)',
    'Jatuh Tempo (YYYY-MM-DD)',
    'Periode Tagihan',
    'Perusahaan Klien',
    'Nama PIC',
    'Sapaan (Tn./Ny.)',
    'Email Klien',
    'WhatsApp Klien',
    'Alamat Penagihan',
    'Deskripsi Item Pekerjaan',
    'Qty',
    'Satuan',
    'Harga Satuan (Rp)',
    'Diskon (Rp)',
    'Pajak PPN 11% (Y/N)',
    'Keterangan Pembayaran (Belum Bayar/Dibayar sebagian/Sudah di bayar/dibatalkan)',
    'Status Dokumen (Terbit/Draft)',
    'Catatan Tambahan',
  ];

  const sampleRows = [
    [
      'INV/DIGITAL/IX/26-0001',
      '2026-09-01',
      '2026-09-15',
      'September 2026',
      'PT Nusantara Teknologi Maju',
      'Budi Santoso',
      'Tn.',
      'finance@nusantaratech.co.id',
      '081234567890',
      'Jl. Sudirman No. 45, Jakarta Selatan',
      'Jasa Pemeliharaan Server Cloud & Keamanan Digital',
      '1',
      'Bulan',
      '15000000',
      '0',
      'Y',
      'Sudah di bayar',
      'Terbit',
      'Pembayaran via transfer rekening blu BCA Digital',
    ],
    [
      'INV/DIGITAL/IX/26-0002',
      '2026-09-10',
      '2026-09-24',
      'September 2026',
      'CV Kreatif Media Utama',
      'Siti Rahma',
      'Ny.',
      'siti@kreatifmedia.com',
      '085678901234',
      'Jl. Gatot Subroto Kav. 12, Jakarta Pusat',
      'Pembuatan Video Promosi & Konten Sosial Media',
      '2',
      'Paket',
      '4500000',
      '500000',
      'N',
      'Dibayar sebagian',
      'Terbit',
      'DP 50% telah diterima',
    ],
    [
      'INV/DIGITAL/IX/26-0003',
      '2026-09-20',
      '2026-10-04',
      'Oktober 2026',
      'PT Global Sukses Bersama',
      'Hendro Wijaya',
      'Tn.',
      'hendro@globalsukses.id',
      '081898765432',
      'Kawasan Industri MM2100, Cikarang',
      'Pengadaan Lisensi Software Antivirus Perusahaan',
      '10',
      'Lisensi',
      '850000',
      '0',
      'Y',
      'Belum Bayar',
      'Terbit',
      'Jatuh tempo 14 hari kalender',
    ],
  ];

  const csvContent =
    '\uFEFF' +
    [headers.map(escapeCSVCell).join(','), ...sampleRows.map((r) => r.map(escapeCSVCell).join(','))].join(
      '\r\n'
    );

  triggerFileDownload(csvContent, 'template_import_invoice.csv', 'text/csv;charset=utf-8;');
}

// Simple RFC 4180 CSV parser
export function parseCSVString(csvText: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [];
  let curr = '';
  let inQuotes = false;

  // Strip BOM if present
  let cleanText = csvText;
  if (cleanText.charCodeAt(0) === 0xfeff) {
    cleanText = cleanText.slice(1);
  }

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        curr += '"';
        i++; // skip escaped quote
      } else if (char === '"') {
        inQuotes = false;
      } else {
        curr += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(curr.trim());
        curr = '';
      } else if (char === '\n' || char === '\r') {
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
        row.push(curr.trim());
        curr = '';
        if (row.length > 0 && row.some((cell) => cell.length > 0)) {
          result.push(row);
        }
        row = [];
      } else {
        curr += char;
      }
    }
  }

  if (curr.length > 0 || row.length > 0) {
    row.push(curr.trim());
    if (row.some((cell) => cell.length > 0)) {
      result.push(row);
    }
  }

  return result;
}

// Parse uploaded file (CSV or JSON) into preview items
export async function parseImportFile(file: File, existingInvoices: Invoice[]): Promise<ImportParsedItem[]> {
  const fileText = await file.text();
  const existingNumbers = new Map(existingInvoices.map((inv) => [inv.invoice_number?.toLowerCase() || '', inv]));

  if (file.name.endsWith('.json') || file.type.includes('json')) {
    try {
      const parsed = JSON.parse(fileText);
      const invoicesArray: any[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.invoices)
        ? parsed.invoices
        : [parsed];

      return invoicesArray.map((inv, idx) => {
        const invNum = inv.invoice_number || `INV-IMP-${idx + 1}`;
        const v = inv.current_version || {};
        const client = v.client_snapshot || {};
        const existing = existingNumbers.get(invNum.toLowerCase());

        const grandTotal = Number(v.grand_total) || 0;
        const ketBayar = normalizePaymentStatus(inv.payment_status, inv.status);

        return {
          rowNumber: idx + 1,
          raw: inv,
          invoiceNumber: invNum,
          issueDate: v.issue_date || new Date().toISOString().slice(0, 10),
          dueDate: v.due_date || new Date().toISOString().slice(0, 10),
          companyName: client.company_name || 'Klien Impor',
          picName: client.pic_name || 'PIC',
          email: client.email || '',
          whatsapp: client.whatsapp || '',
          billingAddress: client.billing_address || '',
          items: (v.items || []).map((it: any) => ({
            description: it.description || 'Pekerjaan',
            quantity: Number(it.quantity) || 1,
            unit: it.unit || 'Unit',
            unitPrice: Number(it.unit_price) || 0,
            total: Number(it.total) || 0,
          })),
          grandTotal,
          paymentStatus: ketBayar,
          documentStatus: inv.status === 'Dibatalkan' ? 'Dibatalkan' : 'Terbit',
          notes: v.client_notes || '',
          isValid: true,
          validationErrors: [],
          existsInDb: !!existing,
          existingId: existing?.id,
        };
      });
    } catch (e: any) {
      throw new Error(`Format file JSON tidak valid: ${e?.message}`);
    }
  }

  // Parse CSV
  const table = parseCSVString(fileText);
  if (table.length < 2) {
    throw new Error('File CSV kosong atau tidak memiliki baris data.');
  }

  const rawHeaders = table[0].map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const dataRows = table.slice(1);

  // Column finder helper
  const findColIndex = (keywords: string[]): number => {
    return rawHeaders.findIndex((h) => keywords.some((k) => h.includes(k)));
  };

  const colInvNum = findColIndex(['nomor', 'noinv', 'invoice']);
  const colIssueDate = findColIndex(['terbit', 'issue', 'tanggalterbit']);
  const colDueDate = findColIndex(['tempo', 'duedate', 'jatuhtempo']);
  const colCompany = findColIndex(['perusahaan', 'company']);
  const colPic = findColIndex(['pic', 'nama']);
  const colEmail = findColIndex(['email']);
  const colPhone = findColIndex(['wa', 'whatsapp', 'telp', 'phone']);
  const colAddress = findColIndex(['alamat', 'address']);
  const colDesc = findColIndex(['deskripsi', 'item', 'pekerjaan']);
  const colQty = findColIndex(['qty', 'jumlah']);
  const colUnit = findColIndex(['satuan', 'unit']);
  const colPrice = findColIndex(['harga', 'price', 'unitprice']);
  const colDiscount = findColIndex(['diskon', 'discount']);
  const colTax = findColIndex(['ppn', 'pajak', 'tax']);
  const colPaymentStatus = findColIndex(['pembayaran', 'bayar', 'paymentstatus']);
  const colDocStatus = findColIndex(['statusdokumen', 'status']);
  const colNotes = findColIndex(['catatan', 'terms', 'notes']);

  const parsedItems: ImportParsedItem[] = [];

  dataRows.forEach((row, index) => {
    if (row.length === 0 || row.every((c) => !c.trim())) return;

    const rowNumber = index + 2; // header is row 1
    const errors: string[] = [];

    const getVal = (idx: number) => (idx >= 0 && row[idx] !== undefined ? row[idx].trim() : '');

    const invNum = getVal(colInvNum) || `INV-IMP-${Date.now().toString().slice(-4)}-${index + 1}`;
    const issueDate = getVal(colIssueDate) || new Date().toISOString().slice(0, 10);
    const dueDate = getVal(colDueDate) || new Date().toISOString().slice(0, 10);
    const company = getVal(colCompany) || getVal(colPic) || 'Klien Impor';
    const pic = getVal(colPic) || 'PIC Klien';
    const email = getVal(colEmail);
    const whatsapp = getVal(colPhone);
    const address = getVal(colAddress);
    const desc = getVal(colDesc) || 'Item Penagihan Jasa / Layanan';
    const qty = Math.max(1, parseFloat(getVal(colQty).replace(/[^0-9.]/g, '')) || 1);
    const unit = getVal(colUnit) || 'Unit';
    const unitPrice = parseFloat(getVal(colPrice).replace(/[^0-9.]/g, '')) || 0;
    const discount = parseFloat(getVal(colDiscount).replace(/[^0-9.]/g, '')) || 0;
    const taxRaw = getVal(colTax).toLowerCase();
    const hasTax = taxRaw === 'y' || taxRaw === 'ya' || taxRaw === 'yes' || taxRaw === 'true' || taxRaw === '11%';

    const subtotal = qty * unitPrice;
    const afterDiscount = Math.max(0, subtotal - discount);
    const taxAmount = hasTax ? Math.round(afterDiscount * 0.11) : 0;
    const grandTotal = afterDiscount + taxAmount;

    // Validate Keterangan Pembayaran
    const rawKetBayar = getVal(colPaymentStatus);
    const paymentStatus = normalizePaymentStatus(rawKetBayar);

    // Validate Document Status
    const rawDocStatus = getVal(colDocStatus).toLowerCase();
    let documentStatus: 'Draft' | 'Terbit' | 'Diajukan' | 'Dibatalkan' = 'Terbit';
    if (rawDocStatus.includes('draft')) documentStatus = 'Draft';
    else if (rawDocStatus.includes('batal')) documentStatus = 'Dibatalkan';
    else if (rawDocStatus.includes('aju')) documentStatus = 'Diajukan';

    if (paymentStatus === 'dibatalkan') {
      documentStatus = 'Dibatalkan';
    }

    const notes = getVal(colNotes);

    if (unitPrice <= 0 && grandTotal <= 0) {
      errors.push('Harga satuan atau grand total tidak boleh Rp 0.');
    }

    const existing = existingNumbers.get(invNum.toLowerCase());

    parsedItems.push({
      rowNumber,
      raw: Object.fromEntries(row.map((val, i) => [rawHeaders[i] || `col_${i}`, val])),
      invoiceNumber: invNum,
      issueDate,
      dueDate,
      companyName: company,
      picName: pic,
      email,
      whatsapp,
      billingAddress: address,
      items: [
        {
          description: desc,
          quantity: qty,
          unit,
          unitPrice,
          total: subtotal,
        },
      ],
      grandTotal,
      paymentStatus,
      documentStatus,
      notes,
      isValid: errors.length === 0,
      validationErrors: errors,
      existsInDb: !!existing,
      existingId: existing?.id,
    });
  });

  return parsedItems;
}
