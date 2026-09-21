import React, { useEffect, useState } from 'react';
import { Download, AlertCircle, Printer, CheckCircle2, ShieldCheck } from 'lucide-react';
import { Invoice } from '../types';
import { formatRupiah, formatTanggalIndonesia } from '../lib/terbilang';
import { generateInvoicePDF } from '../lib/pdf-generator';
import { dataService } from '../lib/data-service';

interface RecipientInvoiceViewProps {
  token: string;
}

export const RecipientInvoiceView: React.FC<RecipientInvoiceViewProps> = ({ token }) => {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    async function loadInvoice() {
      setLoading(true);
      try {
        const res = await dataService.getInvoiceByToken(token);
        if (!res.found || !res.invoice) {
          setError('Tautan invoice tidak ditemukan, telah kadaluarsa, atau akses telah dicabut oleh penerbit.');
        } else if (res.isCanceled) {
          setError('Dokumen invoice ini telah dibatalkan secara resmi oleh penerbit.');
        } else {
          setInvoice(res.invoice);
        }
      } catch (err) {
        setError('Terjadi kesalahan saat memuat dokumen invoice.');
      } finally {
        setLoading(false);
      }
    }
    loadInvoice();
  }, [token]);

  const handleDownloadPDF = async () => {
    if (!invoice) return;
    setIsDownloading(true);
    try {
      const pdfBytes = await generateInvoicePDF({
        invoiceNumber: invoice.invoice_number || 'INVOICE',
        version: invoice.current_version,
      });
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeNumber = (invoice.invoice_number || 'INVOICE').replace(/[^a-zA-Z0-9]/g, '_');
      const safeCompany = (invoice.current_version.client_snapshot.company_name || 'Client').replace(/[^a-zA-Z0-9]/g, '_');
      a.download = `Invoice_${safeNumber}_${safeCompany}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Gagal mengunduh dokumen PDF.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-slate-900 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-semibold text-slate-600">Memuat dokumen invoice resmi...</p>
        </div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl border border-slate-200 max-w-md w-full text-center space-y-4 shadow-md">
          <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-slate-900">Akses Dokumen Tidak Valid</h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            {error || 'Dokumen invoice tidak dapat ditampilkan.'}
          </p>
          <div className="pt-2 text-[11px] text-slate-400">
            Hubungi penerbit tagihan untuk mendapatkan tautan akses resmi terbaru.
          </div>
        </div>
      </div>
    );
  }

  const v = invoice.current_version;
  const client = v.client_snapshot;
  const validPayments = invoice.payments.filter((p) => !p.is_reversed);
  const totalPaid = validPayments.reduce((sum, p) => sum + p.amount, 0);
  const remainingBalance = Math.max(0, v.grand_total - totalPaid);

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Top Control Bar for Recipient (Hidden when printed) */}
        <div className="print:hidden bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Dokumen Resmi Terverifikasi</span>
            <span className="text-slate-300">•</span>
            <span className="font-bold text-slate-900">{invoice.invoice_number}</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handlePrint}
              className="w-full sm:w-auto px-3.5 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
            >
              <Printer className="w-4 h-4" />
              Cetak Dokumen
            </button>
            <button
              disabled={isDownloading}
              onClick={handleDownloadPDF}
              className="w-full sm:w-auto px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-xs"
            >
              <Download className="w-4 h-4" />
              {isDownloading ? 'Menyiapkan PDF...' : 'Unduh PDF Resmi'}
            </button>
          </div>
        </div>

        {/* Cancellation Alert if Canceled */}
        {invoice.status === 'Dibatalkan' && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-rose-900">Dokumen Invoice Ini Telah Dibatalkan</h4>
              <p className="mt-0.5">
                Invoice ini telah ditarik dan dibatalkan secara resmi oleh penerbit tagihan. Segala kewajiban
                pembayaran atas dokumen ini tidak berlaku lagi.
              </p>
            </div>
          </div>
        )}

        {/* The Printable Invoice Sheet */}
        <div className="bg-white p-8 sm:p-12 rounded-xl border border-slate-200 shadow-md space-y-8 print:shadow-none print:border-none print:p-0">
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start border-b border-slate-200 pb-8 gap-6">
            <div>
              {v.logo_snapshot_url ? (
                <img
                  src={v.logo_snapshot_url}
                  alt="Logo"
                  className="max-h-16 max-w-48 object-contain mb-3"
                />
              ) : (
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                  {v.publisher_snapshot.name}
                </h1>
              )}
              <p className="text-xs text-slate-600 font-medium">
                {v.publisher_snapshot.city}, {v.publisher_snapshot.country}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Telp: {v.publisher_snapshot.phone} | Email: {v.publisher_snapshot.email}
              </p>
            </div>

            <div className="text-left sm:text-right w-full sm:w-auto">
              <span className="text-xs font-bold tracking-wider text-slate-400 uppercase">
                INVOICE DIGITAL TEAM
              </span>
              <h2 className="text-xl font-bold text-slate-900 mt-1 font-mono">
                {invoice.invoice_number}
              </h2>
              <table className="text-xs text-slate-700 sm:ml-auto mt-3">
                <tbody>
                  <tr>
                    <td className="text-slate-400 pr-3 py-0.5">Tanggal Terbit:</td>
                    <td className="font-semibold text-slate-800">{formatTanggalIndonesia(v.issue_date)}</td>
                  </tr>
                  <tr>
                    <td className="text-slate-400 pr-3 py-0.5">Jatuh Tempo:</td>
                    <td className="font-semibold text-slate-800">{formatTanggalIndonesia(v.due_date)}</td>
                  </tr>
                  <tr>
                    <td className="text-slate-400 pr-3 py-0.5">Periode:</td>
                    <td className="font-semibold text-slate-800">{v.period || '-'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Kepada */}
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Ditagihkan Kepada:
            </span>
            <h3 className="text-base font-bold text-slate-900">
              {client.sapaan} {client.pic_name}
            </h3>
            <p className="text-xs font-semibold text-slate-800 mt-0.5">{client.company_name}</p>
            <p className="text-xs text-slate-600 whitespace-pre-line mt-1 max-w-lg leading-relaxed">
              {client.billing_address || '-'}
            </p>
          </div>

          {/* Table Items */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-xs text-left text-slate-800">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-3.5 w-12 text-center">No.</th>
                  <th className="py-3 px-3.5">Deskripsi Pekerjaan</th>
                  <th className="py-3 px-3.5 w-20 text-center">Qty</th>
                  <th className="py-3 px-3.5 w-24">Satuan</th>
                  <th className="py-3 px-3.5 w-32 text-right">Harga Satuan</th>
                  <th className="py-3 px-3.5 w-36 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {v.items.map((item, idx) => (
                  <tr key={item.id || idx}>
                    <td className="py-3 px-3.5 text-center text-slate-400">{idx + 1}</td>
                    <td className="py-3 px-3.5 font-medium whitespace-pre-line leading-relaxed">
                      {item.description}
                    </td>
                    <td className="py-3 px-3.5 text-center">{item.quantity}</td>
                    <td className="py-3 px-3.5">{item.unit || '-'}</td>
                    <td className="py-3 px-3.5 text-right">{formatRupiah(item.unit_price)}</td>
                    <td className="py-3 px-3.5 text-right font-bold text-slate-900">
                      {formatRupiah(item.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Rekapitulasi & Terbilang */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 items-start">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Terbilang:
              </span>
              <p className="text-xs italic font-semibold text-slate-800 leading-relaxed">
                "{v.terbilang}"
              </p>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100 text-slate-600">
                <span>Subtotal:</span>
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

              {totalPaid > 0 && (
                <>
                  <div className="flex justify-between py-1 border-b border-slate-100 text-emerald-700 font-semibold">
                    <span>Telah Dibayarkan:</span>
                    <span>{formatRupiah(totalPaid)}</span>
                  </div>
                  <div className="flex justify-between py-1 text-slate-900 font-bold">
                    <span>Sisa Tagihan:</span>
                    <span>{formatRupiah(remainingBalance)}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Rekening & Catatan */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 pt-6 border-t border-slate-200 text-xs">
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-slate-900 uppercase tracking-wider block mb-2">
                Instruksi Pembayaran Transfer:
              </span>
              <p className="text-slate-700 font-medium">Bank: {v.bank_snapshot.bank_name}</p>
              <p className="text-slate-900 font-bold text-sm">
                No. Rekening: {v.bank_snapshot.account_number}
              </p>
              <p className="text-slate-700 font-medium">A.N: {v.bank_snapshot.account_name}</p>
              {v.payment_terms && (
                <p className="text-slate-500 mt-2 whitespace-pre-line text-[11px] leading-relaxed">
                  {v.payment_terms}
                </p>
              )}
            </div>

            <div className="space-y-2">
              {v.client_notes && (
                <div>
                  <span className="text-[11px] font-bold text-slate-900 uppercase tracking-wider block mb-1">
                    Catatan:
                  </span>
                  <p className="text-slate-600 whitespace-pre-line leading-relaxed">{v.client_notes}</p>
                </div>
              )}
              <div className="mt-8 text-right sm:text-left">
                <p className="text-slate-500">Hormat Kami,</p>
                <p className="font-bold text-slate-900 mt-8">{v.publisher_snapshot.name}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
