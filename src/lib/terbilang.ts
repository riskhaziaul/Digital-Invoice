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
