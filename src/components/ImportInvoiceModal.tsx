import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  Download,
  AlertCircle,
  CheckCircle2,
  X,
  FileText,
  AlertTriangle,
  RefreshCw,
  Check,
} from 'lucide-react';
import { Invoice } from '../types';
import {
  downloadCSVTemplate,
  parseImportFile,
  ImportParsedItem,
} from '../lib/export-import';
import { dataService } from '../lib/data-service';
import { formatRupiah, formatTanggalIndonesia } from '../lib/terbilang';

interface ImportInvoiceModalProps {
  existingInvoices: Invoice[];
  onClose: () => void;
  onSuccess: () => void;
}

export const ImportInvoiceModal: React.FC<ImportInvoiceModalProps> = ({
  existingInvoices,
  onClose,
  onSuccess,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedItems, setParsedItems] = useState<ImportParsedItem[]>([]);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number;
    updated: number;
    errors: string[];
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (selectedFile: File) => {
    setFile(selectedFile);
    setIsParsing(true);
    setParseError(null);
    setParsedItems([]);
    setImportResult(null);

    try {
      const items = await parseImportFile(selectedFile, existingInvoices);
      setParsedItems(items);
    } catch (err: any) {
      console.error('Parse error:', err);
      setParseError(err.message || 'Gagal memproses berkas impor.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleExecuteImport = async () => {
    if (parsedItems.length === 0) return;
    setIsImporting(true);

    try {
      const res = await dataService.importInvoices(parsedItems, updateExisting);
      setImportResult({
        imported: res.importedCount,
        updated: res.updatedCount,
        errors: res.errors,
      });
      if (res.success) {
        setTimeout(() => {
          onSuccess();
        }, 1200);
      }
    } catch (err: any) {
      console.error('Import execute error:', err);
      alert('Gagal mengeksekusi impor: ' + err.message);
    } finally {
      setIsImporting(false);
    }
  };

  const validItemsCount = parsedItems.filter((i) => i.isValid).length;
  const existingItemsCount = parsedItems.filter((i) => i.existsInDb).length;
  const newItemsCount = validItemsCount - existingItemsCount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 my-8 max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Import Data Invoice</h2>
              <p className="text-xs text-slate-500">
                Unggah berkas CSV (Excel) atau JSON untuk memasukkan banyak data invoice sekaligus.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto space-y-4 flex-1 pr-1">
          {/* Template Download Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl">
            <div className="flex items-center gap-2.5">
              <Download className="w-4 h-4 text-blue-700 shrink-0" />
              <div className="text-xs">
                <span className="font-bold text-blue-950">Belum punya format file yang cocok?</span>
                <p className="text-blue-800 text-[11px]">
                  Unduh template CSV resmi lengkap dengan kolom Keterangan Pembayaran.
                </p>
              </div>
            </div>
            <button
              onClick={downloadCSVTemplate}
              className="px-3 py-1.5 rounded-lg bg-white hover:bg-blue-100/70 text-blue-700 text-xs font-semibold border border-blue-200 transition-colors shadow-2xs flex items-center justify-center gap-1.5 shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Unduh Template CSV
            </button>
          </div>

          {/* Upload Dropzone */}
          {!file && (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-blue-500 hover:bg-blue-50/20 rounded-2xl p-8 text-center cursor-pointer transition-colors"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv, .json, text/csv, application/json"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileChange(e.target.files[0]);
                  }
                }}
              />
              <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mx-auto mb-3">
                <UploadCloud className="w-6 h-6" />
              </div>
              <p className="text-xs font-bold text-slate-800">
                Klik untuk memilih berkas atau seret file ke sini
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Mendukung berkas format .CSV (Microsoft Excel) atau .JSON
              </p>
            </div>
          )}

          {/* Parsing State */}
          {isParsing && (
            <div className="p-8 text-center space-y-3">
              <RefreshCw className="w-6 h-6 text-blue-600 animate-spin mx-auto" />
              <p className="text-xs font-medium text-slate-600">
                Memproses dan memvalidasi baris data...
              </p>
            </div>
          )}

          {/* Parse Error */}
          {parseError && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="text-xs">
                <h4 className="font-bold text-rose-900">Format File Tidak Valid</h4>
                <p className="text-rose-700 mt-0.5">{parseError}</p>
                <button
                  onClick={() => {
                    setFile(null);
                    setParseError(null);
                  }}
                  className="mt-2 text-rose-800 font-semibold underline hover:text-rose-950"
                >
                  Pilih Berkas Lain
                </button>
              </div>
            </div>
          )}

          {/* Preview Parsed Data */}
          {parsedItems.length > 0 && !importResult && (
            <div className="space-y-4">
              {/* File Info Bar & Reset */}
              <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-600" />
                  <span className="text-xs font-bold text-slate-900">{file?.name}</span>
                  <span className="text-[11px] text-slate-500">
                    ({parsedItems.length} baris terdeteksi)
                  </span>
                </div>
                <button
                  onClick={() => {
                    setFile(null);
                    setParsedItems([]);
                  }}
                  className="text-xs text-rose-600 hover:text-rose-800 font-semibold"
                >
                  Ganti Berkas
                </button>
              </div>

              {/* Statistics Pill */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
                  <div className="text-lg font-bold text-emerald-800">{newItemsCount}</div>
                  <div className="text-[11px] text-emerald-700">Invoice Baru</div>
                </div>
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-center">
                  <div className="text-lg font-bold text-blue-800">{existingItemsCount}</div>
                  <div className="text-[11px] text-blue-700">Nomor Sudah Ada (Update)</div>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
                  <div className="text-lg font-bold text-slate-800">{validItemsCount}</div>
                  <div className="text-[11px] text-slate-600">Total Siap Diimpor</div>
                </div>
              </div>

              {/* Update Options */}
              {existingItemsCount > 0 && (
                <div className="flex items-center gap-2.5 p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-xs">
                  <input
                    type="checkbox"
                    id="chk-update-existing"
                    checked={updateExisting}
                    onChange={(e) => setUpdateExisting(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                  />
                  <label
                    htmlFor="chk-update-existing"
                    className="font-medium text-amber-950 cursor-pointer"
                  >
                    Perbarui data jika nomor invoice sudah ada di database ({existingItemsCount}{' '}
                    invoice)
                  </label>
                </div>
              )}

              {/* Preview Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>Pratinjau Data Impor (Maks 10 Baris Pertama)</span>
                  <span className="text-[11px] font-normal text-slate-500">
                    Menampilkan {Math.min(10, parsedItems.length)} dari {parsedItems.length}
                  </span>
                </div>
                <div className="overflow-x-auto max-h-56">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-100/70 text-slate-600 border-b border-slate-200 text-[11px]">
                      <tr>
                        <th className="py-2 px-3">No</th>
                        <th className="py-2 px-3">Nomor Invoice</th>
                        <th className="py-2 px-3">Perusahaan & PIC</th>
                        <th className="py-2 px-3">Tgl Terbit</th>
                        <th className="py-2 px-3">Grand Total</th>
                        <th className="py-2 px-3">Keterangan Bayar</th>
                        <th className="py-2 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-[11px]">
                      {parsedItems.slice(0, 10).map((it, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/70">
                          <td className="py-2 px-3 text-slate-400">{it.rowNumber}</td>
                          <td className="py-2 px-3 font-bold text-slate-900">{it.invoiceNumber}</td>
                          <td className="py-2 px-3">
                            <div className="font-semibold">{it.companyName}</div>
                            <div className="text-[10px] text-slate-400">{it.picName}</div>
                          </td>
                          <td className="py-2 px-3">{it.issueDate}</td>
                          <td className="py-2 px-3 font-semibold">{formatRupiah(it.grandTotal)}</td>
                          <td className="py-2 px-3">
                            <span
                              className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                it.paymentStatus === 'Sudah di bayar'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : it.paymentStatus === 'Dibayar sebagian'
                                  ? 'bg-blue-100 text-blue-800'
                                  : it.paymentStatus === 'dibatalkan'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-amber-100 text-amber-900'
                              }`}
                            >
                              {it.paymentStatus}
                            </span>
                          </td>
                          <td className="py-2 px-3">
                            {it.existsInDb ? (
                              <span className="text-[10px] text-blue-600 font-semibold">
                                Update Ada
                              </span>
                            ) : (
                              <span className="text-[10px] text-emerald-600 font-semibold">
                                Baru
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Import Result Feedback */}
          {importResult && (
            <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-2xl text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-emerald-950">Impor Berhasil Diselesaikan!</h3>
              <p className="text-xs text-emerald-800">
                {importResult.imported} invoice baru berhasil dibuat dan {importResult.updated}{' '}
                invoice berhasil diperbarui.
              </p>
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            {importResult ? 'Selesai & Tutup' : 'Batal'}
          </button>
          {!importResult && parsedItems.length > 0 && (
            <button
              disabled={isImporting || validItemsCount === 0}
              onClick={handleExecuteImport}
              className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-2 shadow-xs transition-colors disabled:opacity-50"
            >
              {isImporting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Mengimpor...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Impor {validItemsCount} Invoice
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
