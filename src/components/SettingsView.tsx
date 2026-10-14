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
  Cloud,
  ExternalLink,
  DollarSign,
  Plus,
  Edit2,
  Star,
  X,
  AlertCircle,
  Check,
} from 'lucide-react';
import { AppSettings, UserProfile, BankAccount, GeneralClause } from '../types';
import { dataService } from '../lib/data-service';
import { auth, googleSignIn, logout } from '../lib/google-drive';

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

  // Bank Accounts Management
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>(dataService.getBankAccounts());
  const [bankName, setBankName] = useState(settings.bank_name);
  const [bankAccountNo, setBankAccountNo] = useState(settings.bank_account_no);
  const [bankAccountName, setBankAccountName] = useState(settings.bank_account_name);

  // Bank Account Modal
  const [showBankModal, setShowBankModal] = useState(false);
  const [editingBankId, setEditingBankId] = useState<string | null>(null);
  const [modalBankName, setModalBankName] = useState('blu by BCA Digital');
  const [modalAccountNo, setModalAccountNo] = useState('');
  const [modalAccountName, setModalAccountName] = useState('');
  const [modalIsDefault, setModalIsDefault] = useState(false);

  // General Clauses Management
  const [generalClauses, setGeneralClauses] = useState<GeneralClause[]>(dataService.getGeneralClauses());
  const [showClauseModal, setShowClauseModal] = useState(false);
  const [editingClauseId, setEditingClauseId] = useState<string | null>(null);
  const [modalClauseTitle, setModalClauseTitle] = useState('');
  const [modalClauseContent, setModalClauseContent] = useState('');
  const [modalClauseIsActive, setModalClauseIsActive] = useState(true);

  // Logo
  const [logoUrl, setLogoUrl] = useState(settings.logo_url || '');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Defaults
  const [defaultClientNotes, setDefaultClientNotes] = useState(settings.default_client_notes || '');
  const [defaultWorkTerms, setDefaultWorkTerms] = useState(settings.default_work_terms || '');
  const [defaultPaymentTerms, setDefaultPaymentTerms] = useState(settings.default_payment_terms || '');
  const [defaultCurrency, setDefaultCurrency] = useState<'IDR' | 'USD'>(settings.default_currency || 'IDR');
  const [defaultUsdRate, setDefaultUsdRate] = useState<number>(settings.default_usd_rate || 16250);

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

  const refreshBankAccounts = () => {
    const updated = dataService.getBankAccounts();
    setBankAccounts(updated);
    const def = updated.find((a) => a.is_default) || updated[0];
    if (def) {
      setBankName(def.bank_name);
      setBankAccountNo(def.account_number);
      setBankAccountName(def.account_name);
    }
  };

  const handleOpenAddBank = () => {
    setEditingBankId(null);
    setModalBankName('blu by BCA Digital');
    setModalAccountNo('');
    setModalAccountName(bankAccountName || 'Riskha Ziaulhusna');
    setModalIsDefault(bankAccounts.length === 0);
    setShowBankModal(true);
  };

  const handleOpenEditBank = (acc: BankAccount) => {
    setEditingBankId(acc.id);
    setModalBankName(acc.bank_name);
    setModalAccountNo(acc.account_number);
    setModalAccountName(acc.account_name);
    setModalIsDefault(Boolean(acc.is_default));
    setShowBankModal(true);
  };

  const handleSaveBankAccountModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalBankName.trim() || !modalAccountNo.trim() || !modalAccountName.trim()) {
      alert('Nama Bank, Nomor Rekening, dan Atas Nama wajib diisi.');
      return;
    }
    const res = dataService.saveBankAccount({
      id: editingBankId || undefined,
      bank_name: modalBankName.trim(),
      account_number: modalAccountNo.trim(),
      account_name: modalAccountName.trim(),
      is_default: modalIsDefault,
    });
    alert(res.message);
    if (res.success) {
      setShowBankModal(false);
      refreshBankAccounts();
      onRefresh();
    }
  };

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmLabel: 'Ya, Hapus',
    onConfirm: () => {},
  });

  const handleDeleteBank = (id: string) => {
    dataService.deleteBankAccount(id);
    refreshBankAccounts();
    onRefresh();
  };

  const handleSetDefaultBank = (id: string) => {
    const res = dataService.setDefaultBankAccount(id);
    if (res.success) {
      refreshBankAccounts();
      onRefresh();
    }
  };

  const refreshGeneralClauses = () => {
    setGeneralClauses(dataService.getGeneralClauses());
  };

  const handleOpenAddClause = () => {
    setEditingClauseId(null);
    setModalClauseTitle('');
    setModalClauseContent('');
    setModalClauseIsActive(true);
    setShowClauseModal(true);
  };

  const handleOpenEditClause = (clause: GeneralClause) => {
    setEditingClauseId(clause.id);
    setModalClauseTitle(clause.title || '');
    setModalClauseContent(clause.content);
    setModalClauseIsActive(clause.is_active !== false);
    setShowClauseModal(true);
  };

  const handleSaveClauseModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalClauseContent.trim()) {
      alert('Isi klausul wajib diisi.');
      return;
    }
    const res = dataService.saveGeneralClause({
      id: editingClauseId || undefined,
      title: modalClauseTitle.trim() || undefined,
      content: modalClauseContent.trim(),
      is_active: modalClauseIsActive,
    });
    if (res.success) {
      setShowClauseModal(false);
      refreshGeneralClauses();
      onRefresh();
    }
  };

  const handleDeleteClause = (id: string) => {
    dataService.deleteGeneralClause(id);
    refreshGeneralClauses();
    onRefresh();
  };

  const handleToggleClause = (id: string) => {
    const res = dataService.toggleGeneralClause(id);
    if (res.success) {
      refreshGeneralClauses();
      onRefresh();
    }
  };

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
      default_currency: defaultCurrency,
      default_usd_rate: Number(defaultUsdRate) || 16250,
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

        {/* Section 3: Rekening Pembayaran Resmi */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 gap-3">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-slate-700" />
              <div>
                <h2 className="text-sm font-bold text-slate-900">3. Rekening Bank Tujuan Pembayaran</h2>
                <p className="text-[11px] text-slate-500">
                  Kelola rekening tujuan transfer resmi. Anda dapat menambah rekening baru, mengedit, dan menetapkan rekening utama (default).
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleOpenAddBank}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors shadow-xs cursor-pointer self-start sm:self-auto shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Rekening Baru</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-1">
            {bankAccounts.map((acc) => (
              <div
                key={acc.id}
                className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
                  acc.is_default
                    ? 'border-indigo-500 bg-indigo-50/30 ring-1 ring-indigo-500/20'
                    : 'border-slate-200 bg-slate-50 hover:bg-white hover:border-slate-300'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                      <CreditCard className={`w-3.5 h-3.5 ${acc.is_default ? 'text-indigo-600' : 'text-slate-500'}`} />
                      <span>{acc.bank_name}</span>
                    </span>
                    {acc.is_default ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                        Utama (Default)
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSetDefaultBank(acc.id)}
                        className="text-[10px] font-medium text-slate-500 hover:text-indigo-600 flex items-center gap-1 transition-colors cursor-pointer"
                        title="Jadikan rekening utama"
                      >
                        <Star className="w-3 h-3" />
                        <span>Jadikan Utama</span>
                      </button>
                    )}
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                      Nomor Rekening
                    </span>
                    <span className="font-mono font-bold text-sm text-slate-900 block select-all">
                      {acc.account_number}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                      Atas Nama (A.N)
                    </span>
                    <span className="text-xs font-semibold text-slate-700 block truncate">
                      {acc.account_name}
                    </span>
                  </div>
                </div>

                <div className="pt-3 mt-3 border-t border-slate-200/60 flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleOpenEditBank(acc)}
                    className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 transition-colors text-xs flex items-center gap-1 font-medium cursor-pointer"
                    title="Edit rekening ini"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteBank(acc.id, acc.bank_name)}
                    className="p-1.5 rounded-lg text-rose-600 hover:text-rose-800 hover:bg-rose-50 transition-colors text-xs flex items-center gap-1 font-medium cursor-pointer"
                    title="Hapus rekening pembayaran ini"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus</span>
                  </button>
                </div>
              </div>
            ))}

            {bankAccounts.length === 0 && (
              <div className="col-span-full p-8 text-center border-2 border-dashed border-slate-200 rounded-xl">
                <CreditCard className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-700">Belum ada rekening bank pembayaran</p>
                <p className="text-[11px] text-slate-400 mt-0.5 mb-3">
                  Tambahkan rekening tujuan agar klien dapat melakukan pembayaran ke rekening Anda.
                </p>
                <button
                  type="button"
                  onClick={handleOpenAddBank}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Rekening Sekarang</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Section 4: Klausul Umum (General Clauses) */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 gap-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              <div>
                <h2 className="text-sm font-bold text-slate-900">4. Klausul Umum Dokumen (General Clauses)</h2>
                <p className="text-[11px] text-slate-500">
                  Buat dan kelola klausul umum yang tercantum utuh pada invoice PDF resmi. Anda dapat menambah lebih dari satu klausul dan mengaturnya kapan saja.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleOpenAddClause}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors shadow-xs cursor-pointer self-start sm:self-auto shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Klausul Baru</span>
            </button>
          </div>

          <div className="space-y-3 pt-1">
            {generalClauses.map((clause, idx) => (
              <div
                key={clause.id || idx}
                className={`p-4 rounded-xl border transition-all space-y-2.5 ${
                  clause.is_active !== false
                    ? 'bg-slate-50 border-slate-200'
                    : 'bg-slate-50/50 border-dashed border-slate-300 opacity-75'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 font-bold text-[11px] flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span className="font-bold text-xs text-slate-900">
                      {clause.title || `Klausul ${idx + 1}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleToggleClause(clause.id)}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold cursor-pointer border transition-colors ${
                        clause.is_active !== false
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : 'bg-slate-200 text-slate-600 border-slate-300'
                      }`}
                      title="Klik untuk mengubah status aktif"
                    >
                      {clause.is_active !== false ? '✓ Aktif pada Invoice' : 'Nonaktif'}
                    </button>
                  </div>

                  <div className="flex items-center gap-1 self-end sm:self-auto">
                    <button
                      type="button"
                      onClick={() => handleOpenEditClause(clause)}
                      className="px-2.5 py-1 rounded-md text-slate-600 hover:text-slate-900 hover:bg-white border border-transparent hover:border-slate-200 text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteClause(clause.id, clause.title)}
                      className="px-2.5 py-1 rounded-md text-rose-600 hover:text-rose-800 hover:bg-rose-50 border border-transparent hover:border-rose-200 text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Hapus</span>
                    </button>
                  </div>
                </div>

                <div className="bg-white p-3 rounded-lg border border-slate-200 text-xs text-slate-700 whitespace-pre-line leading-relaxed">
                  {clause.content}
                </div>
              </div>
            ))}

            {generalClauses.length === 0 && (
              <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-xl">
                <FileText className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-700">Belum ada klausul umum yang dibuat</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Klik tombol "Tambah Klausul Baru" di atas untuk menambahkan klausul umum tagihan.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Section 5: Catatan & Ketentuan Standar */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <FileText className="w-4 h-4 text-slate-700" />
            <h2 className="text-sm font-bold text-slate-900">5. Teks Catatan & Ketentuan Bawaan</h2>
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

        {/* Section 6: Pilihan Mata Uang & Kurs Dollar */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <DollarSign className="w-4 h-4 text-emerald-600" />
            <h2 className="text-sm font-bold text-slate-900">6. Pengaturan Mata Uang & Kurs Dollar (USD)</h2>
          </div>

          <p className="text-xs text-slate-500">
            Atur mata uang bawaan dokumen dan kurs acuan Dollar (USD). Kurs di aplikasi dapat berubah sesuai fluktuasi pasar atau kesepakatan penagihan kustom, dan selalu dapat Anda ubah bebas per invoice maupun per baris item.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Mata Uang Default Dokumen
              </label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setDefaultCurrency('IDR')}
                  className={`p-2.5 rounded-lg border text-left flex items-center justify-between cursor-pointer transition-colors ${
                    defaultCurrency === 'IDR'
                      ? 'border-slate-900 bg-slate-50 text-slate-900 font-bold ring-1 ring-slate-900'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  <span>🇮🇩 Rupiah (IDR)</span>
                  {defaultCurrency === 'IDR' && <CheckCircle2 className="w-4 h-4 text-slate-900" />}
                </button>
                <button
                  type="button"
                  onClick={() => setDefaultCurrency('USD')}
                  className={`p-2.5 rounded-lg border text-left flex items-center justify-between cursor-pointer transition-colors ${
                    defaultCurrency === 'USD'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-bold ring-1 ring-emerald-600'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  <span>🇺🇸 US Dollar (USD)</span>
                  {defaultCurrency === 'USD' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5">
                Mata uang default saat membuat invoice baru. Setiap item tetap bisa dipilih Rupiah atau Dollar secara terpisah.
              </p>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Kurs Acuan Dollar Kustom (Rp per $1 USD)
              </label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">Rp</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="16250"
                  value={defaultUsdRate || ''}
                  onChange={(e) => setDefaultUsdRate(Math.max(1, parseFloat(e.target.value) || 0))}
                  className="w-full pl-9 pr-3 p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-mono font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 text-xs"
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1.5">
                <span>Nilai konversi: <strong>$1.00 = Rp {new Intl.NumberFormat('id-ID').format(defaultUsdRate || 0)}</strong></span>
                <span className="text-slate-400">Dapat diedit custom per invoice</span>
              </div>
            </div>
          </div>
        </div>

        {/* Section 6: Integrasi Google Drive */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Cloud className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-bold text-slate-900">6. Integrasi Google Drive</h2>
            </div>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                auth.currentUser
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {auth.currentUser ? 'Terhubung' : 'Belum Terhubung'}
            </span>
          </div>

          <div className="text-xs text-slate-600 space-y-3">
            <p>
              Google Drive digunakan untuk menyimpan salinan arsip dokumen PDF invoice ke folder khusus <strong>"Invoice Digital"</strong>.
            </p>

            {auth.currentUser ? (
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {auth.currentUser.photoURL ? (
                    <img
                      src={auth.currentUser.photoURL}
                      alt="Profile"
                      className="w-8 h-8 rounded-full border border-slate-300"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-xs">
                      G
                    </div>
                  )}
                  <div>
                    <p className="font-semibold text-slate-900">
                      {auth.currentUser.displayName || 'Akun Google Terhubung'}
                    </p>
                    <p className="text-[11px] text-slate-500">{auth.currentUser.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await logout();
                      onRefresh();
                    }}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-200 text-slate-600 text-xs font-semibold transition-colors"
                  >
                    Putuskan Akun
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-blue-50/50 border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-xs text-slate-600">
                  Sambungkan akun Google Anda untuk mengaktifkan sinkronisasi otomatis dan pencadangan PDF ke Google Drive.
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await googleSignIn();
                      onRefresh();
                    } catch (e: any) {
                      alert(e.message || 'Gagal masuk dengan Google');
                    }
                  }}
                  className="px-4 py-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-2 shadow-xs shrink-0"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                  </svg>
                  <span>Sambungkan Google Drive</span>
                </button>
              </div>
            )}
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

      {/* Modal Tambah/Edit Rekening Bank */}
      {showBankModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  {editingBankId ? 'Edit Rekening Bank Tujuan' : 'Tambah Rekening Bank Baru'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowBankModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveBankAccountModal} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nama Bank <span className="text-rose-500">*</span>
                </label>
                <div className="space-y-1.5">
                  <input
                    type="text"
                    required
                    placeholder="Contoh: blu by BCA Digital, BCA, Mandiri"
                    value={modalBankName}
                    onChange={(e) => setModalBankName(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                  />
                  <div className="flex flex-wrap gap-1">
                    {['blu by BCA Digital', 'BCA', 'Mandiri', 'BNI', 'BRI', 'BSI'].map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setModalBankName(b)}
                        className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nomor Rekening <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: 000480500229"
                  value={modalAccountNo}
                  onChange={(e) => setModalAccountNo(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-mono font-bold focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Atas Nama (A.N) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Riskha Ziaulhusna"
                  value={modalAccountName}
                  onChange={(e) => setModalAccountName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={modalIsDefault}
                    onChange={(e) => setModalIsDefault(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="font-semibold text-slate-800">
                    Jadikan sebagai Rekening Utama (Default)
                  </span>
                </label>
                <p className="text-[11px] text-slate-400 pl-5 mt-0.5">
                  Rekening utama akan otomatis menjadi pilihan nomor 1 pada setiap invoice baru.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowBankModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 font-medium transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Simpan Rekening</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Tambah/Edit Klausul Umum */}
      {showClauseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  {editingClauseId ? 'Edit Klausul Umum' : 'Tambah Klausul Umum Baru'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowClauseModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveClauseModal} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Judul Klausul (Opsional / Singkat)
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Biaya Item Tambahan, Deliverables, Pembatalan"
                  value={modalClauseTitle}
                  onChange={(e) => setModalClauseTitle(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Isi Klausul Lengkap <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="Tuliskan isi syarat & ketentuan klausul secara lengkap..."
                  value={modalClauseContent}
                  onChange={(e) => setModalClauseContent(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900 leading-relaxed"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Klausul akan tercetak secara utuh tanpa terpotong di dokumen PDF invoice.
                </p>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={modalClauseIsActive}
                    onChange={(e) => setModalClauseIsActive(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span className="font-semibold text-slate-800">
                    Aktifkan klausul ini pada invoice terbit
                  </span>
                </label>
                <p className="text-[11px] text-slate-400 pl-5 mt-0.5">
                  Jika aktif, klausul akan otomatis disertakan pada berkas invoice dan PDF.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowClauseModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 font-medium transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Simpan Klausul</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 space-y-4 animate-scale-in">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">{confirmModal.title}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{confirmModal.message}</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 text-xs">
              <button
                type="button"
                onClick={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
                className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => confirmModal.onConfirm()}
                className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold transition-colors shadow-xs cursor-pointer"
              >
                {confirmModal.confirmLabel || 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
