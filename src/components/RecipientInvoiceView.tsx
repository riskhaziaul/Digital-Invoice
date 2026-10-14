import React, { useEffect, useState, useCallback } from 'react';
import { Download, AlertCircle, Printer, CheckCircle2, ShieldCheck, MessageSquare, Mail, RefreshCw, Paperclip, FileText, ExternalLink, DollarSign } from 'lucide-react';
import { Invoice } from '../types';
import { formatRupiah, formatUSD, formatTanggalIndonesia, formatAngka, getExchangeRatesSummary } from '../lib/terbilang';
import { generateInvoicePDF } from '../lib/pdf-generator';
import { dataService } from '../lib/data-service';
import { AttachmentManager } from './AttachmentManager';

interface RecipientInvoiceViewProps {
  token: string;
}

export const RecipientInvoiceView: React.FC<RecipientInvoiceViewProps> = ({ token }) => {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const handleDownloadPDF = useCallback(async (invToUse?: Invoice) => {
    const target = invToUse || invoice;
    if (!target) return;
    setIsDownloading(true);
    try {
      const atts = target.current_version.attachments || target.attachments || [];
      const pdfBytes = await generateInvoicePDF({
        invoiceNumber: target.invoice_number || 'INVOICE',
        version: target.current_version,
        attachments: atts,
        createdByName: target.created_by_name || target.current_version.created_by_name,
      });
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeNumber = (target.invoice_number || 'INVOICE').replace(/[^a-zA-Z0-9]/g, '_');
      const safeCompany = (target.current_version.client_snapshot.company_name || 'Client').replace(/[^a-zA-Z0-9]/g, '_');
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
  }, [invoice]);

  useEffect(() => {
    let isMounted = true;
    async function loadInvoice() {
      setLoading(true);
      setError(null);
      try {
        const res = await dataService.getInvoiceByToken(token);
        if (!isMounted) return;
        if (!res.found || !res.invoice) {
          setError('Tautan invoice tidak ditemukan, telah kadaluarsa, atau akses telah dicabut oleh penerbit.');
        } else if (res.isCanceled) {
          setError('Dokumen invoice ini telah dibatalkan secara resmi oleh penerbit.');
        } else {
          setInvoice(res.invoice);
          // If recipient route specifically requested PDF download
          if (window.location.pathname.endsWith('/pdf') || window.location.search.includes('format=pdf')) {
            setTimeout(() => {
              handleDownloadPDF(res.invoice);
            }, 600);
          }
        }
      } catch (err) {
        if (isMounted) setError('Terjadi kesalahan saat memuat dokumen invoice. Silakan coba kembali.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadInvoice();
    return () => {
      isMounted = false;
    };
  }, [token, retryKey, handleDownloadPDF]);

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
          <h2 className="text-base font-bold text-slate-900">Akses Dokumen Tidak Ditemukan</h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            {error || 'Dokumen invoice tidak dapat ditampilkan atau tautan tidak valid.'}
          </p>
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
            <button
              onClick={() => setRetryKey((k) => k + 1)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors shadow-xs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Coba Muat Ulang
            </button>
            <a
              href="/"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-200 transition-colors"
            >
              Buka Beranda Aplikasi
            </a>
          </div>
          <div className="pt-2 text-[11px] text-slate-400">
            Pastikan invoice telah diterbitkan oleh penerbit atau hubungi penerbit tagihan untuk mendapatkan tautan terbaru.
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
              onClick={() => handleDownloadPDF()}
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
                  <tr>
                    <td className="text-slate-400 pr-3 py-0.5">Ket. Pembayaran:</td>
                    <td>
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
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
                    </td>
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
                      <span>{item.description}</span>
                      {item.currency === 'USD' && (
                        <div className="mt-1 flex items-center gap-1.5 text-[10px] text-emerald-800 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 w-fit">
                          <DollarSign className="w-3 h-3 text-emerald-600" />
                          <span>USD (Valas) • Kurs: Rp {formatAngka(item.custom_exchange_rate || v.custom_exchange_rate || 16250)} / $1</span>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3.5 text-center">{item.quantity}</td>
                    <td className="py-3 px-3.5">{item.unit || '-'}</td>
                    <td className="py-3 px-3.5 text-right">
                      {item.currency === 'USD' ? (
                        <div>
                          <span className="font-bold text-slate-900">{formatUSD(item.unit_price_usd || 0)}</span>
                          <span className="text-[10px] text-slate-500 block">({formatRupiah(item.unit_price)})</span>
                        </div>
                      ) : (
                        formatRupiah(item.unit_price)
                      )}
                    </td>
                    <td className="py-3 px-3.5 text-right font-bold text-slate-900">
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

          {/* Valas Info Callout for Recipient */}
          {v.items.some((i) => i.currency === 'USD' || (i.unit_price_usd && i.unit_price_usd > 0)) && (
            <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-lg text-xs text-emerald-900 flex items-start gap-2.5 print:bg-white print:border-slate-300">
              <DollarSign className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Informasi Kurs Valuta Asing (USD):</span>
                <p className="text-[11px] text-emerald-800 mt-0.5 leading-relaxed">
                  Dokumen invoice ini memuat item dengan denominasi US Dollar (USD) sejumlah{' '}
                  <strong>
                    {formatUSD(
                      v.items.reduce((s, i) => s + (i.currency === 'USD' ? (Number(i.total_usd) || 0) : 0), 0)
                    )}
                  </strong>
                  . Konversi resmi ke mata uang Rupiah mengacu pada kurs kustom yang disepakati (Kurs acuan:{' '}
                  {getExchangeRatesSummary(v.items, v.custom_exchange_rate)}).
                </p>
              </div>
            </div>
          )}

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
              <div className="pt-6 border-t border-slate-200 text-xs">
                <span className="text-[11px] font-bold text-slate-900 uppercase tracking-wider block mb-2">
                  Klausul Umum / Syarat & Ketentuan (General Clauses):
                </span>
                <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 space-y-2">
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

              {/* Konfirmasi Pembayaran via WhatsApp / Email */}
              <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap gap-2">
                {v.publisher_snapshot?.phone && (
                  <a
                    href={`https://wa.me/${v.publisher_snapshot.phone.replace(/[^0-9]/g, '').replace(/^0/, '62')}?text=${encodeURIComponent(
                      `Halo ${v.publisher_snapshot?.name || ''}, saya ingin mengonfirmasi pembayaran untuk Invoice No: ${invoice.invoice_number}`
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold transition-colors shadow-xs"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Konfirmasi via WhatsApp
                  </a>
                )}
                {v.publisher_snapshot?.email && (
                  <a
                    href={`mailto:${v.publisher_snapshot.email}?subject=${encodeURIComponent(
                      `Konfirmasi Pembayaran Invoice ${invoice.invoice_number}`
                    )}&body=${encodeURIComponent(
                      `Halo ${v.publisher_snapshot?.name || ''},\n\nTerlampir bukti transfer pembayaran untuk Invoice No: ${invoice.invoice_number}.\n\nTerima kasih.`
                    )}`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold transition-colors shadow-xs"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    Kirim Bukti via Email
                  </a>
                )}
              </div>
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
              <div className="mt-6 text-right sm:text-left space-y-1">
                <p className="text-slate-500 font-medium">Hormat Kami,</p>
                <div className="h-12" />
                <p className="font-bold text-slate-900 border-b border-slate-300 pb-0.5 inline-block min-w-36">
                  {(invoice.created_by_name || v.created_by_name || 'Riskha Ziaulhusna').replace(/\s*\((Owner|Admin|Staff|Viewer)\)/gi, '').trim()}
                </p>
              </div>
            </div>
          </div>

          {/* Lampiran Dokumen Resmi di Invoice */}
          <div className="pt-6 border-t border-slate-200 text-xs">
            <div className="flex items-center justify-between mb-3">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {(v.attachments || invoice.attachments || []).map((att, idx) => (
                  <div
                    key={att.id || idx}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
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

        {/* Lampiran Dokumen Resmi */}
        {((v.attachments && v.attachments.length > 0) || (invoice.attachments && invoice.attachments.length > 0)) && (
          <div className="mt-6">
            <AttachmentManager
              title="Lampiran Dokumen Resmi"
              subtitle="Berkas lampiran resmi pendukung invoice yang disertakan oleh penerbit (PO, BAST, bukti kerja, faktur pajak)"
              attachments={v.attachments || invoice.attachments || []}
              readOnly={true}
              canUpload={false}
              canDelete={false}
              invoiceNumber={invoice.invoice_number}
              showGoogleDriveSync={false}
            />
          </div>
        )}
      </div>
    </div>
  );
};
