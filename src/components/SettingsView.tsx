import React, { useState, useRef } from 'react';
import {
  Settings,
  Building2,
  CreditCard,
  Image as ImageIcon,
  Save,
  Upload,
  Trash2,
  CheckCircle2,
  FileText,
} from 'lucide-react';
import { AppSettings, UserProfile } from '../types';
import { dataService } from '../lib/data-service';

interface SettingsViewProps {
  currentUser: UserProfile;
  onRefresh: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ currentUser, onRefresh }) => {
  const settings = dataService.getSettings();

  const [publisherName, setPublisherName] = useState(settings.publisher_name);
  const [publisherCity, setPublisherCity] = useState(settings.publisher_city);
  const [publisherCountry, setPublisherCountry] = useState(settings.publisher_country);
  const [publisherPhone, setPublisherPhone] = useState(settings.publisher_phone);
  const [publisherEmail, setPublisherEmail] = useState(settings.publisher_email);

  // Bank
  const [bankName, setBankName] = useState(settings.bank_name);
  const [bankAccountNo, setBankAccountNo] = useState(settings.bank_account_no);
  const [bankAccountName, setBankAccountName] = useState(settings.bank_account_name);

  // Logo
  const [logoUrl, setLogoUrl] = useState(settings.logo_url || '');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Defaults
  const [defaultClientNotes, setDefaultClientNotes] = useState(settings.default_client_notes || '');
  const [defaultWorkTerms, setDefaultWorkTerms] = useState(settings.default_work_terms || '');
  const [defaultPaymentTerms, setDefaultPaymentTerms] = useState(settings.default_payment_terms || '');

  const canEdit = currentUser.role === 'OWNER' || currentUser.role === 'ADMIN';

  if (!canEdit) {
    return (
      <div className="bg-white p-8 rounded-xl border border-slate-200 text-center max-w-md mx-auto my-12">
        <h3 className="text-base font-bold text-slate-900">Akses Dibatasi</h3>
        <p className="text-xs text-slate-500 mt-1">
          Hanya Owner dan Admin yang memiliki kewenangan mengubah pengaturan penerbit dan rekening.
        </p>
      </div>
    );
  }

  const handleFileProcess = (file: File) => {
    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) {
      alert('Format logo harus berupa PNG, JPG, JPEG, atau WebP.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      alert('Ukuran file logo maksimal 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setLogoUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileProcess(e.target.files[0]);
    }
  };

  const handleRemoveLogo = () => {
    setLogoUrl('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const res = dataService.updateSettings({
      publisher_name: publisherName.trim(),
      publisher_city: publisherCity.trim(),
      publisher_country: publisherCountry.trim(),
      publisher_phone: publisherPhone.trim(),
      publisher_email: publisherEmail.trim(),
      bank_name: bankName.trim(),
      bank_account_no: bankAccountNo.trim(),
      bank_account_name: bankAccountName.trim(),
      logo_url: logoUrl,
      default_client_notes: defaultClientNotes.trim(),
      default_work_terms: defaultWorkTerms.trim(),
      default_payment_terms: defaultPaymentTerms.trim(),
    });

    alert(res.message);
    if (res.success) onRefresh();
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Pengaturan Dokumen & Penerbit</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Kelola profil resmi penerbit tagihan, rekening bank blu by BCA Digital, dan logo opsional.
          </p>
        </div>
      </div>

      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* Section 1: Logo Perusahaan */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <ImageIcon className="w-4 h-4 text-slate-700" />
            <h2 className="text-sm font-bold text-slate-900">1. Logo Perusahaan (Opsional)</h2>
          </div>

          <p className="text-xs text-slate-500">
            Maksimal 2MB (PNG, JPG, WebP). Jika tidak diunggah, dokumen tetap tampil proporsional dengan nama penerbit teks tegas.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            {/* Drag & Drop Box */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`p-6 border-2 border-dashed rounded-xl text-center cursor-pointer transition-colors ${
                isDragging
                  ? 'border-slate-900 bg-slate-50'
                  : 'border-slate-300 hover:border-slate-400 bg-slate-50/50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleFileInputChange}
                className="hidden"
              />
              <Upload className="w-8 h-8 mx-auto text-slate-400 mb-2" />
              <p className="text-xs font-semibold text-slate-700">
                Tarik & letakkan logo ke sini, atau <span className="text-slate-900 underline">pilih file</span>
              </p>
              <p className="text-[10px] text-slate-400 mt-1">PNG, JPG, WebP (Maks. 2MB)</p>
            </div>

            {/* Preview Box */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col items-center justify-center min-h-[140px]">
              {logoUrl ? (
                <div className="space-y-3 text-center">
                  <img
                    src={logoUrl}
                    alt="Logo Preview"
                    className="max-h-20 max-w-44 object-contain mx-auto rounded border border-slate-200 bg-white p-1"
                  />
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    className="inline-flex items-center gap-1 text-xs text-rose-600 hover:text-rose-800 font-semibold"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Hapus Logo
                  </button>
                </div>
              ) : (
                <div className="text-center text-slate-400 space-y-1">
                  <p className="text-xs font-semibold text-slate-600">Tanpa Logo</p>
                  <p className="text-[11px] text-slate-400">
                    Dokumen akan menggunakan teks tipografi resmi: "{publisherName}"
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Section 2: Identitas Penerbit */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Building2 className="w-4 h-4 text-slate-700" />
            <h2 className="text-sm font-bold text-slate-900">2. Identitas Resmi Penerbit</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">
                Nama Penerbit / Bisnis
              </label>
              <input
                type="text"
                required
                value={publisherName}
                onChange={(e) => setPublisherName(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Kota</label>
              <input
                type="text"
                value={publisherCity}
                onChange={(e) => setPublisherCity(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Negara</label>
              <input
                type="text"
                value={publisherCountry}
                onChange={(e) => setPublisherCountry(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">No. Telepon / WhatsApp</label>
              <input
                type="text"
                value={publisherPhone}
                onChange={(e) => setPublisherPhone(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Email Resmi</label>
              <input
                type="email"
                value={publisherEmail}
                onChange={(e) => setPublisherEmail(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
          </div>
        </div>

        {/* Section 3: Rekening Pembayaran */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <CreditCard className="w-4 h-4 text-slate-700" />
            <h2 className="text-sm font-bold text-slate-900">3. Rekening Pembayaran Resmi</h2>
          </div>

          <p className="text-xs text-slate-500">
            Rekening tujuan transfer resmi dari spreadsheet referensi: blu by BCA Digital.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Nama Bank</label>
              <input
                type="text"
                required
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Nomor Rekening</label>
              <input
                type="text"
                required
                value={bankAccountNo}
                onChange={(e) => setBankAccountNo(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-mono font-bold focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Atas Nama (A.N)</label>
              <input
                type="text"
                required
                value={bankAccountName}
                onChange={(e) => setBankAccountName(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
          </div>
        </div>

        {/* Section 4: Catatan & Ketentuan Standar */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <FileText className="w-4 h-4 text-slate-700" />
            <h2 className="text-sm font-bold text-slate-900">4. Teks Standar Dokumen</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Catatan Default untuk Klien
              </label>
              <textarea
                rows={3}
                value={defaultClientNotes}
                onChange={(e) => setDefaultClientNotes(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Ketentuan Pembayaran Default
              </label>
              <textarea
                rows={3}
                value={defaultPaymentTerms}
                onChange={(e) => setDefaultPaymentTerms(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            className="px-6 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-2 shadow-xs transition-colors"
          >
            <Save className="w-4 h-4" />
            Simpan Seluruh Pengaturan
          </button>
        </div>
      </form>
    </div>
  );
};
