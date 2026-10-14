import React, { useState, useRef } from 'react';
import {
  Paperclip,
  Upload,
  FileText,
  File,
  Image as ImageIcon,
  Trash2,
  Eye,
  Download,
  ExternalLink,
  Plus,
  AlertCircle,
  CheckCircle2,
  Cloud,
  X,
  FileSpreadsheet,
  FileArchive,
} from 'lucide-react';
import { AttachmentCategory, InvoiceAttachment } from '../types';
import {
  formatFileSize,
  getAttachmentCategoryLabel,
  getAttachmentCategoryColor,
  downloadAttachmentFile,
  getAttachmentPayload,
  storeAttachmentPayload,
  fileToDataUrl,
} from '../lib/attachment-storage';
import { uploadFileToDrive } from '../lib/google-drive';

interface AttachmentManagerProps {
  attachments: InvoiceAttachment[];
  onChange?: (updated: InvoiceAttachment[]) => void;
  readOnly?: boolean;
  canUpload?: boolean;
  canDelete?: boolean;
  currentUserRole?: string;
  currentUserName?: string;
  invoiceNumber?: string;
  title?: string;
  subtitle?: string;
  showGoogleDriveSync?: boolean;
}

const CATEGORY_OPTIONS: { value: AttachmentCategory; label: string }[] = [
  { value: 'PO', label: 'PO / Surat Pesanan' },
  { value: 'BAST', label: 'BAST / Serah Terima' },
  { value: 'KONTRAK', label: 'Kontrak / SPK' },
  { value: 'BUKTI_KERJA', label: 'Bukti Pekerjaan / Timesheet' },
  { value: 'FAKTUR_PAJAK', label: 'Faktur Pajak / Bukti Potong' },
  { value: 'PENAWARAN', label: 'Penawaran / Quotation' },
  { value: 'LAINNYA', label: 'Dokumen Pendukung Lainnya' },
];

export const AttachmentManager: React.FC<AttachmentManagerProps> = ({
  attachments = [],
  onChange,
  readOnly = false,
  canUpload = true,
  canDelete = true,
  currentUserName = 'Staf',
  invoiceNumber = 'INVOICE',
  title = 'Lampiran Dokumen Pendukung',
  subtitle = 'Sertakan PO, Berita Acara (BAST), kontrak, bukti pekerjaan, atau faktur pajak sebagai lampiran resmi invoice',
  showGoogleDriveSync = true,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<AttachmentCategory>('PO');
  const [descriptionInput, setDescriptionInput] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Preview modal state
  const [previewAttachment, setPreviewAttachment] = useState<InvoiceAttachment | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Google Drive upload state
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<{ id: string; text: string; success: boolean } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const getFileIcon = (mimeType: string, filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    if (mimeType.includes('pdf') || ext === 'pdf') {
      return <FileText className="w-5 h-5 text-rose-600" />;
    }
    if (mimeType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) {
      return <ImageIcon className="w-5 h-5 text-indigo-600" />;
    }
    if (
      mimeType.includes('sheet') ||
      mimeType.includes('excel') ||
      ['xls', 'xlsx', 'csv'].includes(ext)
    ) {
      return <FileSpreadsheet className="w-5 h-5 text-emerald-600" />;
    }
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
      return <FileArchive className="w-5 h-5 text-amber-600" />;
    }
    return <File className="w-5 h-5 text-slate-500" />;
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || readOnly || !canUpload) return;

    setUploadError(null);
    setIsProcessing(true);

    try {
      const newAttachments: InvoiceAttachment[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // 25MB safety limit
        if (file.size > 25 * 1024 * 1024) {
          setUploadError(`Berkas "${file.name}" melebihi batas ukuran maksimal 25 MB.`);
          continue;
        }

        const attachmentId = 'att-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
        const dataUrl = await fileToDataUrl(file);

        // Store payload in IndexedDB for reliable offline storage without bloating localStorage
        await storeAttachmentPayload(attachmentId, dataUrl);

        const newAtt: InvoiceAttachment = {
          id: attachmentId,
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
          category: selectedCategory,
          description: descriptionInput.trim() || undefined,
          // Keep data_url for smaller files (< 1MB) directly in object for immediate access
          data_url: file.size < 1024 * 1024 ? dataUrl : undefined,
          uploaded_by_name: currentUserName,
          uploaded_at: new Date().toISOString(),
        };

        newAttachments.push(newAtt);
      }

      if (newAttachments.length > 0 && onChange) {
        onChange([...attachments, ...newAttachments]);
        setDescriptionInput('');
      }
    } catch (err: any) {
      console.error('File upload error:', err);
      setUploadError(err.message || 'Gagal memproses berkas lampiran.');
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = (attachmentId: string) => {
    if (readOnly || !canDelete) return;
    if (confirm('Apakah Anda yakin ingin menghapus dokumen lampiran ini?')) {
      if (onChange) {
        onChange(attachments.filter((a) => a.id !== attachmentId));
      }
    }
  };

  const handlePreview = async (att: InvoiceAttachment) => {
    setPreviewAttachment(att);
    setPreviewLoading(true);
    setPreviewContent(null);

    try {
      let content = att.data_url;
      if (!content) {
        const payload = await getAttachmentPayload(att.id);
        if (typeof payload === 'string') {
          content = payload;
        } else if (payload instanceof Blob) {
          content = URL.createObjectURL(payload);
        }
      }
      setPreviewContent(content || null);
    } catch (err) {
      console.error('Preview error:', err);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDownload = async (att: InvoiceAttachment) => {
    try {
      await downloadAttachmentFile(att);
    } catch (err: any) {
      alert(`Gagal mengunduh: ${err.message || 'Berkas tidak ditemukan'}`);
    }
  };

  const handleSyncToDrive = async (att: InvoiceAttachment) => {
    setSyncingId(att.id);
    setSyncMessage(null);

    try {
      let payload: any = att.data_url;
      if (!payload) {
        payload = await getAttachmentPayload(att.id);
      }

      if (!payload) {
        throw new Error('Konten berkas tidak tersedia.');
      }

      // Convert data URL or string to Blob/Uint8Array
      let fileBytes: Uint8Array;
      if (typeof payload === 'string' && payload.startsWith('data:')) {
        const base64Data = payload.split(',')[1];
        const binaryStr = atob(base64Data);
        fileBytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          fileBytes[i] = binaryStr.charCodeAt(i);
        }
      } else if (payload && typeof payload.arrayBuffer === 'function') {
        const buffer = await (payload as Blob).arrayBuffer();
        fileBytes = new Uint8Array(buffer);
      } else if (typeof payload === 'string') {
        const enc = new TextEncoder();
        fileBytes = enc.encode(payload);
      } else {
        throw new Error('Format berkas tidak valid untuk diunggah.');
      }

      const uploadedFile = await uploadFileToDrive({
        name: `[Lampiran] ${att.name}`,
        mimeType: att.type,
        content: fileBytes,
        description: `Lampiran untuk invoice ${invoiceNumber}. Kategori: ${getAttachmentCategoryLabel(att.category)}. Diunggah oleh: ${att.uploaded_by_name || 'Sistem'}`,
      });

      if (uploadedFile && uploadedFile.id) {
        setSyncMessage({
          id: att.id,
          text: 'Tersimpan ke Google Drive!',
          success: true,
        });

        // Update attachment with Drive links if mutable
        if (onChange) {
          const updated = attachments.map((a) =>
            a.id === att.id
              ? {
                  ...a,
                  drive_file_id: uploadedFile.id,
                  drive_web_link: uploadedFile.webViewLink,
                }
              : a
          );
          onChange(updated);
        }
      } else {
        throw new Error('Gagal menyimpan ke Google Drive.');
      }
    } catch (err: any) {
      console.error('Google drive upload error:', err);
      setSyncMessage({
        id: att.id,
        text: err.message || 'Gagal menyimpan ke Drive.',
        success: false,
      });
    } finally {
      setSyncingId(null);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center shrink-0">
            <Paperclip className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900">{title}</h3>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-700">
                {attachments.length} Berkas
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
          </div>
        </div>

        {!readOnly && canUpload && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Pilih Berkas Lampiran</span>
          </button>
        )}
      </div>

      {/* Upload Zone (Only when editable) */}
      {!readOnly && canUpload && (
        <div className="p-5 border-b border-slate-100 bg-white">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Kategori Dokumen:
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value as AttachmentCategory)}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900"
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Keterangan Dokumen (Opsional):
              </label>
              <input
                type="text"
                value={descriptionInput}
                onChange={(e) => setDescriptionInput(e.target.value)}
                placeholder="Contoh: BAST ditandatangani kedua pihak / PO No. 8921"
                className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
          </div>

          {/* Drag & Drop Area */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              handleFiles(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${
              isDragging
                ? 'border-indigo-500 bg-indigo-50/60'
                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/60 bg-slate-50/30'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.zip"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />

            <div className="flex flex-col items-center justify-center space-y-1.5">
              <div className="w-10 h-10 rounded-full bg-indigo-100/70 text-indigo-600 flex items-center justify-center">
                <Upload className="w-5 h-5" />
              </div>
              <p className="text-xs font-semibold text-slate-800">
                Tarik & jatuhkan berkas di sini, atau{' '}
                <span className="text-indigo-600 underline">klik untuk memilih</span>
              </p>
              <p className="text-[11px] text-slate-500">
                Mendukung PDF, Word (.docx), Excel (.xlsx), Foto/Gambar (PNG/JPG), dan ZIP (Maks. 25 MB per berkas)
              </p>
            </div>
          </div>

          {uploadError && (
            <div className="mt-3 p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}

          {isProcessing && (
            <div className="mt-3 flex items-center gap-2 text-xs text-indigo-700">
              <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <span>Memproses berkas lampiran...</span>
            </div>
          )}
        </div>
      )}

      {/* Attachments List */}
      <div className="p-5">
        {attachments.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <Paperclip className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-400" />
            <p className="text-xs font-medium text-slate-600">Belum ada lampiran dokumen pada invoice ini.</p>
            <p className="text-[11px] text-slate-400 mt-1">
              {!readOnly
                ? 'Unggah PO, BAST, bukti bayar, atau dokumen kontrak untuk kelengkapan administrasi penagihan.'
                : 'Penerbit belum menyertakan lampiran dokumen tambahan.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {attachments.map((att, idx) => {
              const catColor = getAttachmentCategoryColor(att.category);
              const isPdfOrImg =
                att.type.includes('pdf') ||
                att.name.toLowerCase().endsWith('.pdf') ||
                att.type.startsWith('image/') ||
                ['jpg', 'jpeg', 'png', 'webp'].some((e) => att.name.toLowerCase().endsWith(`.${e}`));

              return (
                <div
                  key={att.id || idx}
                  className="py-3.5 first:pt-0 last:pb-0 flex flex-col md:flex-row md:items-center justify-between gap-3"
                >
                  {/* File info */}
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                      {getFileIcon(att.type, att.name)}
                    </div>

                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-xs text-slate-900 break-all">
                          {att.name}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${catColor.bg} ${catColor.text} ${catColor.border}`}
                        >
                          {getAttachmentCategoryLabel(att.category)}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {formatFileSize(att.size)}
                        </span>
                      </div>

                      {att.description && (
                        <p className="text-xs text-slate-600 italic">
                          "{att.description}"
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                        {att.uploaded_by_name && (
                          <span>Oleh: {att.uploaded_by_name}</span>
                        )}
                        {att.uploaded_at && (
                          <span>
                            {new Date(att.uploaded_at).toLocaleDateString('id-ID', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        )}

                        {att.drive_web_link && (
                          <a
                            href={att.drive_web_link}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>Buka di Google Drive</span>
                          </a>
                        )}
                      </div>

                      {syncMessage && syncMessage.id === att.id && (
                        <p
                          className={`text-[11px] font-semibold mt-1 ${
                            syncMessage.success ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {syncMessage.text}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0 self-end md:self-center">
                    {/* Preview (PDF / Images) */}
                    {isPdfOrImg && (
                      <button
                        type="button"
                        onClick={() => handlePreview(att)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                        title="Pratinjau dokumen di peramban"
                      >
                        <Eye className="w-3.5 h-3.5 text-slate-500" />
                        <span>Lihat</span>
                      </button>
                    )}

                    {/* Download */}
                    <button
                      type="button"
                      onClick={() => handleDownload(att)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                      title="Unduh dokumen lampiran"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-600" />
                      <span>Unduh</span>
                    </button>

                    {/* Sync to Google Drive */}
                    {showGoogleDriveSync && (
                      <button
                        type="button"
                        disabled={syncingId === att.id}
                        onClick={() => handleSyncToDrive(att)}
                        className="px-2.5 py-1.5 rounded-lg border border-blue-200 bg-blue-50/50 hover:bg-blue-100/60 text-blue-700 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                        title="Simpan salinan lampiran ke folder Google Drive"
                      >
                        <Cloud className={`w-3.5 h-3.5 ${syncingId === att.id ? 'animate-pulse' : ''}`} />
                        <span>{syncingId === att.id ? 'Menyimpan...' : 'Ke Drive'}</span>
                      </button>
                    )}

                    {/* Delete */}
                    {!readOnly && canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDelete(att.id)}
                        className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                        title="Hapus lampiran ini"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {previewAttachment && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center shrink-0">
                  {getFileIcon(previewAttachment.type, previewAttachment.name)}
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-bold text-slate-900 truncate">
                    {previewAttachment.name}
                  </h4>
                  <p className="text-xs text-slate-500">
                    {getAttachmentCategoryLabel(previewAttachment.category)} •{' '}
                    {formatFileSize(previewAttachment.size)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownload(previewAttachment)}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPreviewAttachment(null);
                    setPreviewContent(null);
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-auto p-4 bg-slate-100 flex items-center justify-center min-h-[300px]">
              {previewLoading ? (
                <div className="text-center space-y-2">
                  <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-xs font-medium text-slate-600">Memuat pratinjau dokumen...</p>
                </div>
              ) : previewContent ? (
                previewAttachment.type.includes('pdf') || previewAttachment.name.toLowerCase().endsWith('.pdf') ? (
                  <iframe
                    src={previewContent}
                    title={previewAttachment.name}
                    className="w-full h-[70vh] rounded-lg border border-slate-200 bg-white"
                  />
                ) : (
                  <img
                    src={previewContent}
                    alt={previewAttachment.name}
                    className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-sm"
                  />
                )
              ) : (
                <div className="text-center space-y-3 p-8">
                  <AlertCircle className="w-10 h-10 text-slate-400 mx-auto" />
                  <p className="text-xs font-semibold text-slate-700">
                    Pratinjau tidak dapat ditampilkan langsung di jendela ini.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleDownload(previewAttachment)}
                    className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs"
                  >
                    Unduh Berkas untuk Membuka
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
