import React, { useState, useEffect, useMemo } from 'react';
import {
  Cloud,
  Folder,
  FileText,
  Upload,
  Download,
  Trash2,
  ExternalLink,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  HardDrive,
  LogOut,
  ShieldCheck,
  Calendar,
  Layers,
} from 'lucide-react';
import {
  auth,
  initAuth,
  googleSignIn,
  logout,
  getDriveAbout,
  listDriveFiles,
  uploadFileToDrive,
  deleteDriveFile,
  getOrCreateFolder,
  DriveAboutInfo,
} from '../lib/google-drive';
import { generateInvoicePDF } from '../lib/pdf-generator';
import { dataService } from '../lib/data-service';
import type { Invoice, DriveFile, UserProfile } from '../types';

interface GoogleDriveViewProps {
  currentUser: UserProfile;
  invoices: Invoice[];
  onRefreshInvoices?: () => void;
}

export const GoogleDriveView: React.FC<GoogleDriveViewProps> = ({
  currentUser,
  invoices,
  onRefreshInvoices,
}) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(Boolean(auth.currentUser));
  const [aboutInfo, setAboutInfo] = useState<DriveAboutInfo | null>(null);
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Single upload selector
  const [selectedInvoiceToUpload, setSelectedInvoiceToUpload] = useState<string>('');
  const [isUploadingSingle, setIsUploadingSingle] = useState(false);

  // Bulk backup state & modal
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [isBulkBackingUp, setIsBulkBackingUp] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null);

  // Delete confirmation modal (Mandatory for destructive operations)
  const [fileToDelete, setFileToDelete] = useState<DriveFile | null>(null);
  const [isDeletingFile, setIsDeletingFile] = useState(false);

  // Filter published invoices for backup
  const publishedInvoices = useMemo(() => {
    return invoices.filter((i) => i.status === 'Terbit');
  }, [invoices]);

  // Auth initialization
  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        const authed = Boolean(user && token);
        setIsAuthenticated(authed);
        if (authed) {
          loadDriveInfoAndFiles();
        }
      },
      () => {
        setIsAuthenticated(false);
        setAboutInfo(null);
        setDriveFiles([]);
      }
    );

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  const loadDriveInfoAndFiles = async () => {
    setIsLoadingFiles(true);
    setStatusMessage(null);
    try {
      const [about, files] = await Promise.all([
        getDriveAbout().catch(() => null),
        listDriveFiles().catch(() => []),
      ]);
      if (about) setAboutInfo(about);
      setDriveFiles(files);
    } catch (err: any) {
      console.error('Drive load error:', err);
      setStatusMessage({
        type: 'error',
        text: err.message || 'Gagal memuat data dari Google Drive.',
      });
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleSignIn = async () => {
    setIsSigningIn(true);
    setStatusMessage(null);
    try {
      const res = await googleSignIn();
      if (res) {
        setIsAuthenticated(true);
        setStatusMessage({
          type: 'success',
          text: `Berhasil terhubung dengan Google Drive akun: ${res.user.email}`,
        });
        await loadDriveInfoAndFiles();
      }
    } catch (err: any) {
      console.error('Sign-in error:', err);
      setStatusMessage({
        type: 'error',
        text: err.message || 'Gagal masuk ke Google. Pastikan popup tidak diblokir oleh browser.',
      });
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await logout();
      setIsAuthenticated(false);
      setAboutInfo(null);
      setDriveFiles([]);
      setStatusMessage({
        type: 'info',
        text: 'Koneksi akun Google Drive berhasil diputuskan.',
      });
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: 'Gagal memutuskan sesi Google.',
      });
    }
  };

  // Upload single invoice PDF
  const handleUploadSingleInvoice = async () => {
    if (!selectedInvoiceToUpload) return;
    const inv = invoices.find((i) => i.id === selectedInvoiceToUpload);
    if (!inv) return;

    setIsUploadingSingle(true);
    setStatusMessage(null);

    try {
      const v = inv.current_version;
      const atts = v.attachments || inv.attachments || [];
      const pdfBytes = await generateInvoicePDF({
        invoiceNumber: inv.invoice_number || 'DRAFT',
        version: v,
        attachments: atts,
        createdByName: inv.created_by_name || v.created_by_name,
      });

      const safeNumber = (inv.invoice_number || 'DRAFT').replace(/[^a-zA-Z0-9]/g, '_');
      const safeCompany = (v.client_snapshot.company_name || 'Client').replace(/[^a-zA-Z0-9]/g, '_');
      const fileName = `Invoice_${safeNumber}_${safeCompany}_v${inv.revision_number}.pdf`;

      const uploaded = await uploadFileToDrive({
        name: fileName,
        mimeType: 'application/pdf',
        content: pdfBytes,
        description: `Invoice ${inv.invoice_number} untuk ${v.client_snapshot.company_name}. Total: Rp ${v.grand_total.toLocaleString('id-ID')}`,
      });

      dataService.recordAuditLog(
        'INVOICE',
        inv.id,
        `Menyimpan salinan PDF ${fileName} ke Google Drive`
      );

      setStatusMessage({
        type: 'success',
        text: `Berkas "${fileName}" berhasil diunggah ke Google Drive (Folder: Invoice Digital).`,
      });

      setSelectedInvoiceToUpload('');
      await loadDriveInfoAndFiles();
    } catch (err: any) {
      console.error('Upload error:', err);
      setStatusMessage({
        type: 'error',
        text: err.message || 'Gagal mengunggah invoice ke Google Drive.',
      });
    } finally {
      setIsUploadingSingle(false);
    }
  };

  // Bulk backup of all published invoices
  const handleConfirmBulkBackup = async () => {
    if (publishedInvoices.length === 0) return;
    setIsBulkBackingUp(true);
    setShowBulkModal(false);
    setStatusMessage({
      type: 'info',
      text: `Memulai pencadangan ${publishedInvoices.length} invoice ke Google Drive...`,
    });

    let successCount = 0;
    const errors: string[] = [];
    let folderId = '';

    try {
      folderId = await getOrCreateFolder('Invoice Digital');
    } catch (fErr: any) {
      console.error('Folder resolution error:', fErr);
      setIsBulkBackingUp(false);
      setStatusMessage({
        type: 'error',
        text: `Gagal mengakses folder "Invoice Digital" di Google Drive: ${fErr?.message || 'Error autentikasi atau izin akses'}`,
      });
      return;
    }

    for (let i = 0; i < publishedInvoices.length; i++) {
      const inv = publishedInvoices[i];
      setBulkProgress({ current: i + 1, total: publishedInvoices.length });

      try {
        const v = inv.current_version;
        const atts = v.attachments || inv.attachments || [];
        const pdfBytes = await generateInvoicePDF({
          invoiceNumber: inv.invoice_number || 'DRAFT',
          version: v,
          attachments: atts,
          createdByName: inv.created_by_name || v.created_by_name,
        });

        const safeNumber = (inv.invoice_number || 'DRAFT').replace(/[^a-zA-Z0-9]/g, '_');
        const safeCompany = (v.client_snapshot.company_name || 'Client').replace(/[^a-zA-Z0-9]/g, '_');
        const fileName = `Invoice_${safeNumber}_${safeCompany}_v${inv.revision_number}.pdf`;

        await uploadFileToDrive({
          name: fileName,
          mimeType: 'application/pdf',
          content: pdfBytes,
          folderId,
          description: `Backup resmi ${inv.invoice_number}`,
        });

        dataService.recordAuditLog(
          'INVOICE',
          inv.id,
          `Cadangan arsip PDF ${fileName} disimpan ke Google Drive`
        );

        successCount++;
      } catch (err: any) {
        console.error(`Gagal mencadangkan invoice ${inv.invoice_number}:`, err);
        errors.push(`${inv.invoice_number} (${err?.message || 'Gagal'})`);
      }
    }

    setIsBulkBackingUp(false);
    setBulkProgress(null);

    if (successCount === publishedInvoices.length) {
      setStatusMessage({
        type: 'success',
        text: `Berhasil mencadangkan seluruh ${successCount} invoice ke folder "Invoice Digital" di Google Drive.`,
      });
    } else if (successCount > 0) {
      setStatusMessage({
        type: 'info',
        text: `Pencadangan parsial: ${successCount} dari ${publishedInvoices.length} invoice berhasil disimpan. Beberapa invoice gagal: ${errors.slice(0, 3).join('; ')}`,
      });
    } else {
      setStatusMessage({
        type: 'error',
        text: `Gagal mencadangkan invoice ke Google Drive. ${errors[0] || 'Periksa koneksi atau izin akun.'}`,
      });
    }

    await loadDriveInfoAndFiles();
  };

  // Delete file execution with explicit prompt
  const handleExecuteDeleteFile = async () => {
    if (!fileToDelete) return;
    setIsDeletingFile(true);
    try {
      await deleteDriveFile(fileToDelete.id);
      dataService.recordAuditLog(
        'SETTINGS',
        fileToDelete.id,
        `Menghapus berkas "${fileToDelete.name}" dari Google Drive`
      );
      setStatusMessage({
        type: 'success',
        text: `Berkas "${fileToDelete.name}" berhasil dihapus dari Google Drive.`,
      });
      setFileToDelete(null);
      await loadDriveInfoAndFiles();
    } catch (err: any) {
      console.error('Delete file error:', err);
      setStatusMessage({
        type: 'error',
        text: err.message || 'Gagal menghapus berkas di Google Drive.',
      });
    } finally {
      setIsDeletingFile(false);
    }
  };

  // Filtered files list
  const filteredFiles = useMemo(() => {
    if (!searchQuery) return driveFiles;
    const q = searchQuery.toLowerCase();
    return driveFiles.filter((f) => f.name.toLowerCase().includes(q));
  }, [driveFiles, searchQuery]);

  // Format file size
  const formatFileSize = (bytesStr?: string) => {
    if (!bytesStr) return '-';
    const bytes = parseInt(bytesStr, 10);
    if (isNaN(bytes)) return '-';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Calculate storage quota percentages
  const quotaUsage = aboutInfo?.storageQuota?.usage ? parseInt(aboutInfo.storageQuota.usage, 10) : 0;
  const quotaLimit = aboutInfo?.storageQuota?.limit ? parseInt(aboutInfo.storageQuota.limit, 10) : 0;
  const quotaPercent = quotaLimit > 0 ? Math.min(100, Math.round((quotaUsage / quotaLimit) * 100)) : 0;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header Banner */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Integrasi Google Drive</h1>
              <p className="text-xs text-slate-500">
                Arsipkan dan sinkronkan dokumen PDF invoice secara aman ke Google Drive dengan izin akun Google Anda.
              </p>
            </div>
          </div>
        </div>

        {/* Auth CTA or User Profile */}
        <div className="flex items-center gap-3">
          {isAuthenticated && aboutInfo?.user ? (
            <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 p-2 px-3 rounded-lg">
              {aboutInfo.user.photoLink ? (
                <img
                  src={aboutInfo.user.photoLink}
                  alt={aboutInfo.user.displayName || 'Google User'}
                  className="w-8 h-8 rounded-full border border-slate-300"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-xs">
                  {aboutInfo.user.displayName ? aboutInfo.user.displayName.charAt(0) : 'G'}
                </div>
              )}
              <div className="text-left">
                <p className="text-xs font-bold text-slate-800 leading-tight">
                  {aboutInfo.user.displayName || 'Pengguna Google'}
                </p>
                <p className="text-[11px] text-slate-500 leading-tight">
                  {aboutInfo.user.emailAddress}
                </p>
              </div>
              <button
                onClick={handleSignOut}
                className="p-1.5 ml-1 text-slate-400 hover:text-red-600 hover:bg-slate-200 rounded-md transition-colors"
                title="Putuskan Akun Google"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={handleSignIn}
              disabled={isSigningIn}
              className="inline-flex items-center gap-2.5 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 shadow-xs transition-colors cursor-pointer"
            >
              {/* Official Google G Logo SVG */}
              <svg className="w-4 h-4" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
              </svg>
              <span>{isSigningIn ? 'Menghubungkan...' : 'Sambungkan Google Drive'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Status Notifications */}
      {statusMessage && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-xs font-medium ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : statusMessage.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-800'
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : statusMessage.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            ) : (
              <Cloud className="w-4 h-4 text-blue-600 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-slate-400 hover:text-slate-600 font-bold ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* If Not Authenticated Banner */}
      {!isAuthenticated && (
        <div className="bg-gradient-to-br from-blue-50/80 via-white to-slate-50 p-8 rounded-xl border border-blue-200 text-center space-y-4 shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-white shadow-sm border border-blue-100 mx-auto flex items-center justify-center text-blue-600">
            <Cloud className="w-8 h-8" />
          </div>
          <div className="max-w-lg mx-auto space-y-2">
            <h2 className="text-lg font-bold text-slate-900">Hubungkan Akun Google Anda</h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              Dengan izin Anda, aplikasi Invoice Digital dapat menyimpan salinan arsip dokumen PDF invoice langsung ke folder khusus <strong>"Invoice Digital"</strong> di Google Drive Anda. Dokumen tetap aman di cloud dan siap diakses kapan saja.
            </p>
          </div>
          <div className="pt-2">
            <button
              onClick={handleSignIn}
              disabled={isSigningIn}
              className="inline-flex items-center gap-3 px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl shadow-md transition-all cursor-pointer"
            >
              <svg className="w-4 h-4" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
              </svg>
              <span>{isSigningIn ? 'Membuka Google Popup...' : 'Masuk dengan Google & Aktifkan Drive'}</span>
            </button>
          </div>
          <div className="flex items-center justify-center gap-6 text-[11px] text-slate-500 pt-3">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Hanya akses folder aplikasi
            </span>
            <span className="flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-blue-600" />
              Penyimpanan Cloud Resmi
            </span>
          </div>
        </div>
      )}

      {/* Main Drive Dashboard when Authenticated */}
      {isAuthenticated && (
        <div className="space-y-6">
          {/* Storage Quota & Quick Action Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Folder Card */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
                  <Folder className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 font-medium">Folder Target Drive</p>
                  <p className="text-sm font-bold text-slate-900">/Invoice Digital</p>
                </div>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                Otomatis
              </span>
            </div>

            {/* Storage Quota */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-slate-400" />
                  <p className="text-[11px] text-slate-500 font-medium">Kapasitas Google Drive</p>
                </div>
                <span className="text-[11px] font-bold text-slate-700">{quotaPercent}% terpakai</span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-3">
                <div
                  className="bg-blue-600 h-full rounded-full transition-all duration-500"
                  style={{ width: `${quotaPercent}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-2">
                {aboutInfo?.storageQuota?.usage
                  ? `${formatFileSize(aboutInfo.storageQuota.usage)} dari ${
                      aboutInfo.storageQuota.limit ? formatFileSize(aboutInfo.storageQuota.limit) : 'Tak terbatas'
                    }`
                  : 'Memuat kuota...'}
              </p>
            </div>

            {/* Total Invoices Backed Up */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 font-medium">Total Berkas di Drive</p>
                  <p className="text-lg font-bold text-slate-900">{driveFiles.length} Berkas</p>
                </div>
              </div>
              <button
                onClick={loadDriveInfoAndFiles}
                disabled={isLoadingFiles}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                title="Muat Ulang Berkas"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingFiles ? 'animate-spin text-blue-600' : ''}`} />
              </button>
            </div>
          </div>

          {/* Action Operations Toolbar */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Aksi Sinkronisasi Dokumen</h3>
                <p className="text-xs text-slate-500">
                  Unggah invoice tertentu atau cadangkan seluruh invoice resmi yang telah terbit.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Bulk backup trigger */}
                <button
                  onClick={() => setShowBulkModal(true)}
                  disabled={isBulkBackingUp || publishedInvoices.length === 0}
                  className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-2 shadow-xs transition-colors disabled:opacity-50"
                >
                  <Layers className="w-4 h-4" />
                  <span>Cadangkan Semua Terbit ({publishedInvoices.length})</span>
                </button>
              </div>
            </div>

            {/* Quick single upload bar */}
            <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <label className="text-xs font-medium text-slate-700 shrink-0">
                Pilih Invoice untuk Disimpan:
              </label>
              <select
                value={selectedInvoiceToUpload}
                onChange={(e) => setSelectedInvoiceToUpload(e.target.value)}
                className="flex-1 bg-slate-50 border border-slate-300 text-xs rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900"
              >
                <option value="">-- Pilih Dokumen Invoice --</option>
                {invoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoice_number || 'DRAFT'} - {inv.current_version.client_snapshot.company_name} (
                    {inv.status}) - Rp {inv.current_version.grand_total.toLocaleString('id-ID')}
                  </option>
                ))}
              </select>

              <button
                onClick={handleUploadSingleInvoice}
                disabled={!selectedInvoiceToUpload || isUploadingSingle}
                className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-xs transition-colors disabled:opacity-50 shrink-0"
              >
                <Upload className="w-4 h-4" />
                <span>{isUploadingSingle ? 'Mengunggah...' : 'Simpan PDF ke Drive'}</span>
              </button>
            </div>

            {/* Progress bar if bulk backup running */}
            {isBulkBackingUp && bulkProgress && (
              <div className="pt-2">
                <div className="flex items-center justify-between text-xs text-slate-600 font-medium mb-1">
                  <span>Memproses berkas {bulkProgress.current} dari {bulkProgress.total}...</span>
                  <span>{Math.round((bulkProgress.current / bulkProgress.total) * 100)}%</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-blue-600 h-full rounded-full transition-all duration-300"
                    style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Files List Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-500" />
                <h3 className="text-sm font-bold text-slate-900">
                  Daftar Berkas di Folder Google Drive ({filteredFiles.length})
                </h3>
              </div>

              {/* Search input */}
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cari berkas di Drive..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>
            </div>

            {isLoadingFiles ? (
              <div className="p-12 text-center text-slate-400 space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-600" />
                <p className="text-xs font-medium">Memuat berkas dari Google Drive...</p>
              </div>
            ) : filteredFiles.length === 0 ? (
              <div className="p-12 text-center text-slate-400 space-y-3">
                <div className="w-12 h-12 rounded-xl bg-slate-100 mx-auto flex items-center justify-center text-slate-400">
                  <Cloud className="w-6 h-6" />
                </div>
                <p className="text-sm font-medium text-slate-600">Belum ada berkas invoice di Google Drive</p>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Gunakan tombol "Simpan PDF ke Drive" atau "Cadangkan Semua Terbit" untuk mulai mengarsipkan berkas PDF penagihan Anda.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Nama Berkas</th>
                      <th className="py-3 px-4">Tanggal Diunggah</th>
                      <th className="py-3 px-4">Ukuran</th>
                      <th className="py-3 px-4 text-right">Tindakan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredFiles.map((file) => (
                      <tr key={file.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded bg-red-50 text-red-600 flex items-center justify-center shrink-0 border border-red-100">
                              <FileText className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900 leading-tight">{file.name}</p>
                              <p className="text-[10px] text-slate-400 font-mono">ID: {file.id.slice(0, 14)}...</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-slate-500">
                          {file.createdTime ? new Date(file.createdTime).toLocaleString('id-ID') : '-'}
                        </td>
                        <td className="py-3.5 px-4 text-slate-500 font-mono">
                          {formatFileSize(file.size)}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {file.webViewLink && (
                              <a
                                href={file.webViewLink}
                                target="_blank"
                                rel="noreferrer"
                                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 font-medium inline-flex items-center gap-1.5 transition-colors"
                                title="Buka di Google Drive"
                              >
                                <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                                <span>Buka</span>
                              </a>
                            )}

                            {file.webContentLink && (
                              <a
                                href={file.webContentLink}
                                target="_blank"
                                rel="noreferrer"
                                download
                                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                                title="Unduh Berkas"
                              >
                                <Download className="w-4 h-4" />
                              </a>
                            )}

                            {/* Delete File Button triggers explicit confirmation modal */}
                            <button
                              onClick={() => setFileToDelete(file)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              title="Hapus dari Google Drive"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MANDATORY USER CONFIRMATION MODAL FOR DESTRUCTIVE ACTION (DELETE FILE)    */}
      {/* ========================================================================= */}
      {fileToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Konfirmasi Hapus Berkas</h3>
                <p className="text-xs text-slate-500">Tindakan ini akan memodifikasi penyimpanan Google Drive Anda.</p>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-2">
              <p>
                Apakah Anda yakin ingin menghapus berkas berikut dari Google Drive Anda secara permanen?
              </p>
              <div className="p-2.5 bg-white rounded-lg border border-slate-200 font-mono text-[11px] text-slate-800 break-all">
                {fileToDelete.name}
              </div>
              <p className="text-[11px] text-amber-700 font-medium">
                ⚠️ Catatan: Berkas yang dihapus tidak dapat dipulihkan kembali dari aplikasi ini.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isDeletingFile}
                onClick={() => setFileToDelete(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeletingFile}
                onClick={handleExecuteDeleteFile}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-xs transition-colors flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeletingFile ? 'Menghapus...' : 'Ya, Hapus Permanen'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* BULK BACKUP CONFIRMATION MODAL                                            */}
      {/* ========================================================================= */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Cadangkan Semua Invoice Terbit</h3>
                <p className="text-xs text-slate-500">Konfirmasi pembuatan arsip PDF ke Google Drive.</p>
              </div>
            </div>

            <div className="space-y-3 text-xs text-slate-700">
              <p>
                Sistem akan membuat berkas PDF untuk <strong>{publishedInvoices.length} invoice resmi</strong> yang telah terbit dan menyimpannya ke folder <strong>"Invoice Digital"</strong> di Google Drive Anda.
              </p>

              <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 bg-slate-50 p-2">
                {publishedInvoices.map((inv) => (
                  <div key={inv.id} className="py-1.5 px-2 flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-slate-900">{inv.invoice_number}</span>
                    <span className="text-slate-500">{inv.current_version.client_snapshot.company_name}</span>
                    <span className="font-mono text-slate-700">Rp {inv.current_version.grand_total.toLocaleString('id-ID')}</span>
                  </div>
                ))}
              </div>

              <p className="text-[11px] text-slate-500">
                Operasi ini dijalankan langsung melalui API Google Drive dengan kredensial akun terhubung Anda.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowBulkModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmBulkBackup}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors flex items-center gap-2"
              >
                <Cloud className="w-4 h-4" />
                <span>Mulai Pencadangan ({publishedInvoices.length} Berkas)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
