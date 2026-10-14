import { normalizePaymentStatus } from '../types';

/**
 * Fungsi Terbilang Bahasa Indonesia
 * Menghasilkan konversi angka menjadi kata-kata terbilang resmi dalam Bahasa Indonesia.
 * Contoh: 15000000 -> "Lima Belas Juta Rupiah"
 */

const SATUAN = [
  '',
  'Satu',
  'Dua',
  'Tiga',
  'Empat',
  'Lima',
  'Enam',
  'Tujuh',
  'Delapan',
  'Sembilan',
  'Sepuluh',
  'Sebelas',
];

function konversiRatusan(n: number): string {
  if (n === 0) return '';
  if (n < 12) return SATUAN[n];
  if (n < 20) return SATUAN[n - 10] + ' Belas';
  if (n < 100) {
    const sisa = n % 10;
    return SATUAN[Math.floor(n / 10)] + ' Puluh' + (sisa ? ' ' + SATUAN[sisa] : '');
  }
  if (n < 200) {
    const sisa = n - 100;
    return 'Seratus' + (sisa ? ' ' + konversiRatusan(sisa) : '');
  }
  const sisa = n % 100;
  return SATUAN[Math.floor(n / 100)] + ' Ratus' + (sisa ? ' ' + konversiRatusan(sisa) : '');
}

export function angkaKeTerbilang(nominal: number): string {
  if (isNaN(nominal) || nominal === null || nominal === undefined) {
    return 'Nol Rupiah';
  }

  const bulat = Math.floor(Math.abs(nominal));
  if (bulat === 0) return 'Nol Rupiah';

  let hasil = '';

  const triliun = Math.floor(bulat / 1_000_000_000_000);
  const sisaTriliun = bulat % 1_000_000_000_000;

  const milyar = Math.floor(sisaTriliun / 1_000_000_000);
  const sisaMilyar = sisaTriliun % 1_000_000_000;

  const juta = Math.floor(sisaMilyar / 1_000_000);
  const sisaJuta = sisaMilyar % 1_000_000;

  const ribu = Math.floor(sisaJuta / 1_000);
  const satuan = sisaJuta % 1_000;

  if (triliun > 0) {
    hasil += konversiRatusan(triliun) + ' Triliun ';
  }

  if (milyar > 0) {
    hasil += konversiRatusan(milyar) + ' Miliar ';
  }

  if (juta > 0) {
    hasil += konversiRatusan(juta) + ' Juta ';
  }

  if (ribu > 0) {
    if (ribu === 1 && hasil === '') {
      hasil += 'Seribu ';
    } else {
      hasil += konversiRatusan(ribu) + ' Ribu ';
    }
  }

  if (satuan > 0) {
    hasil += konversiRatusan(satuan) + ' ';
  }

  hasil = hasil.trim();
  return (nominal < 0 ? 'Minus ' : '') + hasil + ' Rupiah';
}

/**
 * Format mata uang Rupiah
 * Contoh: 15000000 -> "Rp 15.000.000"
 */
export function formatRupiah(nominal: number): string {
  if (isNaN(nominal) || nominal === null || nominal === undefined) {
    return 'Rp 0';
  }
  const formatted = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(nominal);

  // Standarisasi spasi: "Rp 15.000.000"
  return formatted.replace(/Rp\s?/, 'Rp ');
}

/**
 * Format angka umum (misal untuk kuantitas desimal)
 */
export function formatAngka(angka: number): string {
  if (isNaN(angka) || angka === null || angka === undefined) return '0';
  return new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: 2,
  }).format(angka);
}

/**
 * Format tanggal Indonesia (contoh: 21 September 2026)
 */
export function formatTanggalIndonesia(dateStr?: string): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(d);
  } catch {
    return dateStr;
  }
}

/**
 * Konversi angka bulan ke Romawi untuk Nomor Invoice
 * 1 -> I, 2 -> II, dst.
 */
export function bulanKeRomawi(bulanIndex1To12: number): string {
  const romawi = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  const idx = Math.max(1, Math.min(12, bulanIndex1To12)) - 1;
  return romawi[idx] || 'I';
}

/**
 * Format mata uang Dollar (USD)
 * Contoh: 100.5 -> "$ 100.50"
 */
export function formatUSD(amount: number): string {
  if (isNaN(amount) || amount === null || amount === undefined) {
    return '$ 0.00';
  }
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return formatted.replace('$', '$ ');
}

/**
 * Format kurs valuta asing (contoh: 16250 -> "Rp 16.250")
 */
export function formatKurs(rate: number): string {
  if (isNaN(rate) || rate === null || rate === undefined || rate <= 0) {
    return 'Rp 0';
  }
  return formatRupiah(rate);
}

/**
 * Konversi angka dollar ke terbilang bahasa Indonesia
 */
export function angkaKeTerbilangUSD(nominal: number): string {
  if (isNaN(nominal) || nominal === null || nominal === undefined || nominal === 0) {
    return 'Nol Dolar Amerika Serikat';
  }
  const bulat = Math.floor(Math.abs(nominal));
  const sen = Math.round((Math.abs(nominal) - bulat) * 100);

  let kataBulat = angkaKeTerbilang(bulat).replace(/\sRupiah$/, ' Dolar Amerika Serikat');
  if (bulat === 0) kataBulat = 'Nol Dolar Amerika Serikat';

  if (sen > 0) {
    const kataSen = angkaKeTerbilang(sen).replace(/\sRupiah$/, ' Sen');
    return `${kataBulat} ${kataSen}`;
  }
  return kataBulat;
}

/**
 * Dapatkan kurs acuan yang efektif digunakan oleh item-item invoice
 */
export function getEffectiveExchangeRate(items?: any[], fallbackRate: number = 16250): number {
  if (!items || items.length === 0) return fallbackRate;
  const usdItems = items.filter(
    (i) => (i.currency === 'USD' || (i.unit_price_usd && i.unit_price_usd > 0)) && i.custom_exchange_rate && i.custom_exchange_rate > 0
  );
  if (usdItems.length > 0) {
    return Number(usdItems[0].custom_exchange_rate) || fallbackRate;
  }
  return fallbackRate;
}

/**
 * Format ringkasan informasi kurs acuan yang digunakan dalam dokumen
 */
export function getExchangeRatesSummary(items?: any[], fallbackRate: number = 16250): string {
  if (!items || items.length === 0) {
    return `Rp ${formatAngka(fallbackRate)} / $1`;
  }
  const usdItems = items.filter(
    (i) => i.currency === 'USD' || (i.unit_price_usd && i.unit_price_usd > 0)
  );
  if (usdItems.length === 0) {
    return `Rp ${formatAngka(fallbackRate)} / $1`;
  }
  const rates = Array.from(
    new Set(
      usdItems
        .map((i) => Number(i.custom_exchange_rate) || fallbackRate)
        .filter((r) => r > 0)
    )
  );
  if (rates.length === 1) {
    return `Rp ${formatAngka(rates[0])} / $1`;
  }
  if (rates.length > 1) {
    return rates.map((r) => `Rp ${formatAngka(r)} / $1`).join(', ');
  }
  return `Rp ${formatAngka(fallbackRate)} / $1`;
}

export interface InvoicePaymentSummary {
  grandTotal: number;
  paidAmount: number;
  remainingAmount: number;
  isPaid: boolean;
  isCanceled: boolean;
  canonicalStatus: 'Belum Bayar' | 'Dibayar sebagian' | 'Sudah di bayar' | 'dibatalkan';
}

/**
 * Menghitung rekap pembayaran invoice secara akurat:
 * - Mengakomodasi status 'Sudah di bayar' baik dengan maupun tanpa record payment eksplisit
 * - Mengakomodasi invoice yang dibatalkan
 * - Menghitung sisa tagihan aktual
 */
export function getInvoicePaymentSummary(inv: {
  status?: string;
  payment_status?: string;
  current_version?: { grand_total?: number };
  payments?: Array<{ amount?: number; is_reversed?: boolean }>;
}): InvoicePaymentSummary {
  const grandTotal = Number(inv.current_version?.grand_total) || 0;
  const recordedPayments = (inv.payments || [])
    .filter((p) => !p.is_reversed)
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const canonicalStatus = normalizePaymentStatus(inv.payment_status, inv.status);

  // Jika invoice dibatalkan
  if (inv.status === 'Dibatalkan' || canonicalStatus === 'dibatalkan') {
    return {
      grandTotal,
      paidAmount: recordedPayments,
      remainingAmount: 0,
      isPaid: false,
      isCanceled: true,
      canonicalStatus: 'dibatalkan',
    };
  }

  // Jika invoice sudah dibayar lunas
  if (canonicalStatus === 'Sudah di bayar') {
    const paidAmount = Math.max(recordedPayments, grandTotal);
    return {
      grandTotal,
      paidAmount,
      remainingAmount: 0,
      isPaid: true,
      isCanceled: false,
      canonicalStatus: 'Sudah di bayar',
    };
  }

  // Jika invoice dibayar sebagian
  if (canonicalStatus === 'Dibayar sebagian') {
    const paidAmount = Math.min(grandTotal, recordedPayments);
    const remainingAmount = Math.max(0, grandTotal - paidAmount);
    return {
      grandTotal,
      paidAmount,
      remainingAmount,
      isPaid: remainingAmount === 0,
      isCanceled: false,
      canonicalStatus: 'Dibayar sebagian',
    };
  }

  // Status 'Belum Bayar'
  const paidAmount = Math.min(grandTotal, recordedPayments);
  const remainingAmount = Math.max(0, grandTotal - paidAmount);
  return {
    grandTotal,
    paidAmount,
    remainingAmount,
    isPaid: remainingAmount === 0 && grandTotal > 0,
    isCanceled: false,
    canonicalStatus: 'Belum Bayar',
  };
}

export const BULAN_INDONESIA = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

/**
 * Dapatkan nama bulan dalam Bahasa Indonesia
 */
export function getNamaBulanIndonesia(date: Date = new Date()): string {
  return BULAN_INDONESIA[date.getMonth()] || 'Januari';
}

/**
 * Format bulan dan tahun berjalan (contoh: "September 2026")
 */
export function formatBulanTahunBerjalan(date: Date = new Date()): string {
  return `${getNamaBulanIndonesia(date)} ${date.getFullYear()}`;
}

/**
 * Menyesuaikan string periode dokumen ke bulan dan tahun berjalan
 */
export function adjustPeriodToCurrentMonth(originalPeriod?: string, targetDate: Date = new Date()): string {
  const currentMonth = getNamaBulanIndonesia(targetDate);
  const currentYear = String(targetDate.getFullYear());

  if (!originalPeriod || !originalPeriod.trim()) {
    return `${currentMonth} ${currentYear}`;
  }

  const raw = originalPeriod.trim();
  const monthRegex = new RegExp(`\\b(${BULAN_INDONESIA.join('|')})\\b`, 'gi');

  if (monthRegex.test(raw)) {
    // Ganti nama bulan lama dengan nama bulan berjalan
    let replaced = raw.replace(monthRegex, currentMonth);
    // Ganti tahun 4 digit (20xx) jika ada
    replaced = replaced.replace(/\b20\d{2}\b/g, currentYear);
    return replaced;
  }

  // Jika tidak mengandung nama bulan spesifik (misal hanya angka atau teks lain)
  return `${raw} (${currentMonth} ${currentYear})`;
}

/**
 * Menyesuaikan teks rincian item jika menyebutkan nama bulan dan tahun tertentu
 */
export function adjustItemDescriptionToCurrentMonth(description: string, targetDate: Date = new Date()): string {
  if (!description) return '';
  const currentMonth = getNamaBulanIndonesia(targetDate);
  const currentYear = String(targetDate.getFullYear());

  const monthRegex = new RegExp(`\\b(${BULAN_INDONESIA.join('|')})\\b`, 'gi');
  if (monthRegex.test(description)) {
    let replaced = description.replace(monthRegex, currentMonth);
    replaced = replaced.replace(/\b20\d{2}\b/g, currentYear);
    return replaced;
  }
  return description;
}


