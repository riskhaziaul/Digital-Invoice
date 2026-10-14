import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Eye,
  Save,
  Send,
  CheckCircle2,
  Building2,
  HelpCircle,
  DollarSign,
  RefreshCw,
  Info,
  Copy,
  Calendar,
  CreditCard,
  FileText,
} from 'lucide-react';
import {
  Client,
  Invoice,
  InvoiceAttachment,
  InvoiceItem,
  SapaanType,
  UserProfile,
  BankAccount,
  BankSnapshot,
  GeneralClause,
} from '../types';
import {
  angkaKeTerbilang,
  formatRupiah,
  formatUSD,
  formatKurs,
  formatTanggalIndonesia,
  formatAngka,
  getEffectiveExchangeRate,
  getExchangeRatesSummary,
  formatBulanTahunBerjalan,
} from '../lib/terbilang';
import { dataService } from '../lib/data-service';
import { AttachmentManager } from './AttachmentManager';

interface InvoiceFormViewProps {
  initialInvoice?: Invoice;
  clients: Client[];
  currentUser: UserProfile;
  onBack: () => void;
  onSaveSuccess: (invoiceId: string) => void;
}

export const InvoiceFormView: React.FC<InvoiceFormViewProps> = ({
  initialInvoice,
  clients,
  currentUser,
  onBack,
  onSaveSuccess,
}) => {
  const isEditing = Boolean(initialInvoice);
  const settings = dataService.getSettings();

  // Client Selection & Snapshot
  const [selectedClientId, setSelectedClientId] = useState<string>(initialInvoice?.client_id || '');
  const [sapaan, setSapaan] = useState<SapaanType>(
    initialInvoice?.current_version.client_snapshot.sapaan || 'Tn.'
  );
  const [picName, setPicName] = useState(
    initialInvoice?.current_version.client_snapshot.pic_name || ''
  );
  const [companyName, setCompanyName] = useState(
    initialInvoice?.current_version.client_snapshot.company_name || ''
  );
  const [billingAddress, setBillingAddress] = useState(
    initialInvoice?.current_version.client_snapshot.billing_address || ''
  );
  const [email, setEmail] = useState(
    initialInvoice?.current_version.client_snapshot.email || ''
  );
  const [whatsapp, setWhatsapp] = useState(
    initialInvoice?.current_version.client_snapshot.whatsapp || ''
  );

  // Document Dates & Period
  const [issueDate, setIssueDate] = useState(
    initialInvoice?.current_version.issue_date || ''
  );
  const [dueDate, setDueDate] = useState(
    initialInvoice?.current_version.due_date || ''
  );
  const [period, setPeriod] = useState(
    initialInvoice?.current_version.period || ''
  );

  // Currency & Custom Exchange Rate
  const detectedInitialRate = initialInvoice?.current_version?.items?.find(
    (i) => (i.currency === 'USD' || (i.unit_price_usd && i.unit_price_usd > 0)) && i.custom_exchange_rate && i.custom_exchange_rate > 0
  )?.custom_exchange_rate || initialInvoice?.current_version?.custom_exchange_rate || settings.default_usd_rate || 16250;

  const [currency, setCurrency] = useState<'IDR' | 'USD'>(
    initialInvoice?.current_version?.currency || settings.default_currency || 'IDR'
  );
  const [customExchangeRate, setCustomExchangeRate] = useState<number>(detectedInitialRate);

  // Items
  const [items, setItems] = useState<InvoiceItem[]>(
    initialInvoice?.current_version.items && initialInvoice.current_version.items.length > 0
      ? initialInvoice.current_version.items.map((item) => ({
          ...item,
          currency: item.currency || 'IDR',
          custom_exchange_rate: item.custom_exchange_rate || initialInvoice?.current_version?.custom_exchange_rate || settings.default_usd_rate || 16250,
          unit_price_usd: item.unit_price_usd || (item.currency === 'USD' ? Math.round(((item.unit_price || 0) / (item.custom_exchange_rate || 16250)) * 100) / 100 : 0),
          total_usd: item.total_usd || (item.currency === 'USD' ? Math.round(((item.total || 0) / (item.custom_exchange_rate || 16250)) * 100) / 100 : 0),
        }))
      : [
          {
            id: 'item-' + Date.now(),
            sort_order: 1,
            description: '',
            quantity: 0,
            unit: 'bulan',
            unit_price: 0,
            total: 0,
            currency: settings.default_currency || 'IDR',
            unit_price_usd: 0,
            custom_exchange_rate: settings.default_usd_rate || 16250,
            total_usd: 0,
          },
        ]
  );

  // Discount & Tax
  const [discountType, setDiscountType] = useState<'percent' | 'nominal'>(
    initialInvoice?.current_version.discount_type || 'percent'
  );
  const [discountValue, setDiscountValue] = useState<number>(
    initialInvoice?.current_version.discount_value || 0
  );
  const [taxEnabled, setTaxEnabled] = useState<boolean>(
    initialInvoice?.current_version.tax_enabled || false
  );
  const [taxRate, setTaxRate] = useState<number>(
    initialInvoice?.current_version.tax_rate || 11
  );

  // Notes & Terms
  const [clientNotes, setClientNotes] = useState(() => {
    const raw = initialInvoice?.current_version.client_notes || settings.default_client_notes || '';
    if (raw.includes('Item tambahan akan dikenakan biaya tambahan') || raw.trim().toLowerCase() === 'general clause') {
      return '';
    }
    return raw;
  });
  const [workTerms, setWorkTerms] = useState(
    initialInvoice?.current_version.work_terms || settings.default_work_terms || ''
  );
  const [paymentTerms, setPaymentTerms] = useState(
    initialInvoice?.current_version.payment_terms || settings.default_payment_terms || ''
  );

  // Attachments
  const [attachments, setAttachments] = useState<InvoiceAttachment[]>(
    initialInvoice?.current_version?.attachments || initialInvoice?.attachments || []
  );

  // Bank Destination Selection
  const [allBankAccounts, setAllBankAccounts] = useState<BankAccount[]>(() => dataService.getBankAccounts());
  const initialBank = initialInvoice?.current_version?.bank_snapshot || {
    bank_name: settings.bank_name,
    account_number: settings.bank_account_no,
    account_name: settings.bank_account_name,
  };
  const [selectedBank, setSelectedBank] = useState<BankSnapshot>(initialBank);

  // Custom in-app confirmation modal (eliminates blocked browser confirm in iframe)
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

  const handleDeleteBankFromForm = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    dataService.deleteBankAccount(id);
    const updated = dataService.getBankAccounts();
    setAllBankAccounts(updated);
    if (updated.length > 0) {
      const def = updated.find((a) => a.is_default) || updated[0];
      setSelectedBank({
        bank_name: def.bank_name,
        account_number: def.account_number,
        account_name: def.account_name,
      });
    } else {
      setSelectedBank({
        bank_name: '',
        account_number: '',
        account_name: '',
      });
    }
  };

  const handleDeleteClauseFromForm = (idx: number) => {
    setGeneralClauses((prev) => prev.filter((_, i) => i !== idx));
  };

  // General Clauses State (Per-invoice customizable)
  const [generalClauses, setGeneralClauses] = useState<GeneralClause[]>(() => {
    const defaultFirstClause: GeneralClause = {
      id: 'clause-default-1',
      title: 'General Clause',
      content: '1. Item tambahan akan dikenakan biaya tambahan\n2. Biaya Tambahan akan ditagih langsung, di luar tagihan utama',
      is_active: true,
    };

    if (initialInvoice?.current_version?.general_clauses && initialInvoice.current_version.general_clauses.length > 0) {
      return [...initialInvoice.current_version.general_clauses];
    }

    const masterClauses = dataService.getGeneralClauses();
    if (masterClauses.length > 0) {
      return [...masterClauses];
    }
    return [defaultFirstClause];
  });
  const [newClauseTitle, setNewClauseTitle] = useState('');
  const [newClauseContent, setNewClauseContent] = useState('');
  const [showAddClauseInline, setShowAddClauseInline] = useState(false);

  // Preview Mode Tab
  const [showPreview, setShowPreview] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Handle client selection from dropdown (copies master data)
  const handleClientSelect = (clientId: string) => {
    setSelectedClientId(clientId);
    const client = clients.find((c) => c.id === clientId);
    if (client) {
      setSapaan(client.sapaan);
      setPicName(client.pic_name);
      setCompanyName(client.company_name);
      setBillingAddress(client.billing_address);
      setEmail(client.email);
      setWhatsapp(client.whatsapp);
    }
  };

  // Calculations
  const subtotal = items.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
  const hasUsdItems = items.some((i) => i.currency === 'USD' || (i.unit_price_usd && i.unit_price_usd > 0));
  const totalUsdAmount = items.reduce(
    (sum, i) => sum + (i.currency === 'USD' ? (Number(i.total_usd) || 0) : 0),
    0
  );

  let discountAmount = 0;
  if (discountValue > 0) {
    if (discountType === 'percent') {
      discountAmount = Math.round(subtotal * (Math.min(100, Math.max(0, discountValue)) / 100));
    } else {
      discountAmount = Math.min(subtotal, Math.max(0, discountValue));
    }
  }

  const taxableBase = Math.max(0, subtotal - discountAmount);
  const taxAmount = taxEnabled ? Math.round(taxableBase * (Math.max(0, taxRate) / 100)) : 0;
  const grandTotal = taxableBase + taxAmount;
  const terbilang = angkaKeTerbilang(grandTotal);

  // Item Management
  const handleAddItem = () => {
    setItems([
      ...items,
      {
        id: 'item-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
        sort_order: items.length + 1,
        description: '',
        quantity: 0,
        unit: 'bulan',
        unit_price: 0,
        total: 0,
        currency: currency,
        unit_price_usd: 0,
        custom_exchange_rate: customExchangeRate,
        total_usd: 0,
      },
    ]);
  };

  const handleUpdateItem = (
    index: number,
    field: keyof InvoiceItem,
    value: any
  ) => {
    const updated = [...items];
    const target = { ...updated[index], [field]: value };

    if (field === 'currency') {
      const isUSD = value === 'USD';
      target.currency = isUSD ? 'USD' : 'IDR';
      if (isUSD) {
        if (!target.custom_exchange_rate || target.custom_exchange_rate <= 0) {
          target.custom_exchange_rate = customExchangeRate;
        }
        if ((!target.unit_price_usd || target.unit_price_usd === 0) && target.unit_price > 0) {
          target.unit_price_usd = Math.round((target.unit_price / (target.custom_exchange_rate || 16250)) * 100) / 100;
        }
        const q = Number(target.quantity) || 0;
        const uUsd = Number(target.unit_price_usd) || 0;
        const rate = Number(target.custom_exchange_rate) || customExchangeRate;
        target.unit_price = Math.round(uUsd * rate);
        target.total_usd = Math.round(q * uUsd * 100) / 100;
        target.total = Math.round(q * target.unit_price);
      } else {
        const q = Number(target.quantity) || 0;
        target.total = Math.round(q * (Number(target.unit_price) || 0));
      }
    } else if (field === 'unit_price_usd' || field === 'custom_exchange_rate') {
      const q = Number(target.quantity) || 0;
      const uUsd = field === 'unit_price_usd' ? (parseFloat(value) || 0) : (Number(target.unit_price_usd) || 0);
      const rate = field === 'custom_exchange_rate' ? (parseFloat(value) || customExchangeRate) : (Number(target.custom_exchange_rate) || customExchangeRate);
      target.unit_price_usd = uUsd;
      target.custom_exchange_rate = rate;
      target.unit_price = Math.round(uUsd * rate);
      target.total_usd = Math.round(q * uUsd * 100) / 100;
      target.total = Math.round(q * target.unit_price);
      if (field === 'custom_exchange_rate' && parseFloat(value) > 0) {
        setCustomExchangeRate(parseFloat(value));
      }
    } else if (field === 'quantity') {
      const q = parseFloat(value) || 0;
      target.quantity = q;
      if (target.currency === 'USD') {
        const uUsd = Number(target.unit_price_usd) || 0;
        const rate = Number(target.custom_exchange_rate) || customExchangeRate;
        target.unit_price = Math.round(uUsd * rate);
        target.total_usd = Math.round(q * uUsd * 100) / 100;
        target.total = Math.round(q * target.unit_price);
      } else {
        target.total = Math.round(q * (Number(target.unit_price) || 0));
      }
    } else if (field === 'unit_price') {
      const p = parseFloat(value) || 0;
      target.unit_price = p;
      const q = Number(target.quantity) || 0;
      target.total = Math.round(q * p);
      if (target.currency === 'USD' && target.custom_exchange_rate) {
        target.unit_price_usd = Math.round((p / target.custom_exchange_rate) * 100) / 100;
        target.total_usd = Math.round(q * target.unit_price_usd * 100) / 100;
      }
    }

    updated[index] = target;
    setItems(updated);
  };

  const handleApplyExchangeRateToAllUSD = (rate: number) => {
    setCustomExchangeRate(rate);
    const updated = items.map((item) => {
      if (item.currency === 'USD') {
        const uUsd = Number(item.unit_price_usd) || 0;
        const q = Number(item.quantity) || 0;
        const unit_price = Math.round(uUsd * rate);
        const total = Math.round(q * unit_price);
        return {
          ...item,
          custom_exchange_rate: rate,
          unit_price,
          total,
          total_usd: Math.round(q * uUsd * 100) / 100,
        };
      }
      return item;
    });
    setItems(updated);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) {
      alert('Minimal harus ada satu item dalam invoice.');
      return;
    }
    const updated = items.filter((_, i) => i !== index).map((item, idx) => ({
      ...item,
      sort_order: idx + 1,
    }));
    setItems(updated);
  };

  const handleMoveItem = (index: number, direction: 'up' | 'down') => {
    const newIdx = direction === 'up' ? index - 1 : index + 1;
    if (newIdx < 0 || newIdx >= items.length) return;
    const updated = [...items];
    const temp = updated[index];
    updated[index] = updated[newIdx];
    updated[newIdx] = temp;
    setItems(updated.map((item, idx) => ({ ...item, sort_order: idx + 1 })));
  };

  // Save Draft Action
  const handleSaveDraft = () => {
    const effectiveExchangeRate = getEffectiveExchangeRate(items, Number(customExchangeRate) || 16250);
    const result = dataService.saveInvoiceDraft({
      id: initialInvoice?.id,
      clientId: selectedClientId || undefined,
      clientSnapshot: {
        sapaan,
        pic_name: picName.trim(),
        company_name: companyName.trim(),
        billing_address: billingAddress.trim(),
        email: email.trim(),
        whatsapp: whatsapp.trim(),
      },
      issueDate,
      dueDate,
      period: period.trim(),
      items,
      currency,
      customExchangeRate: effectiveExchangeRate,
      discountType,
      discountValue: Number(discountValue) || 0,
      taxEnabled,
      taxRate: Number(taxRate) || 0,
      clientNotes,
      workTerms,
      paymentTerms,
      attachments,
      bankSnapshot: selectedBank,
      bankAccountsSnapshot: allBankAccounts,
      generalClauses,
    });

    if (result.success && result.invoice) {
      alert(result.message);
      onSaveSuccess(result.invoice.id);
    } else {
      alert(result.message);
    }
  };

  // Helper untuk sinkronisasi cepat ke tanggal hari ini dan bulan berjalan
  const handleSyncToCurrentMonth = () => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const due = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
    const dueStr = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`;
    setIssueDate(todayStr);
    setDueDate(dueStr);
    setPeriod(formatBulanTahunBerjalan(today));
  };

  // Submit Draft for Approval (Staff)
  const handleSubmitForApproval = () => {
    if (!picName.trim() && !companyName.trim()) {
      alert('Nama penerima (PIC) atau nama perusahaan wajib diisi sebelum mengajukan.');
      return;
    }
    if (!issueDate || !dueDate) {
      alert('Tanggal terbit dan jatuh tempo wajib diisi.');
      return;
    }
    if (new Date(dueDate) < new Date(issueDate)) {
      alert('Tanggal jatuh tempo tidak boleh sebelum tanggal terbit.');
      return;
    }

    const resolvedPic = picName.trim() || companyName.trim();
    const resolvedCompany = companyName.trim() || picName.trim();
    const resolvedPeriod = period.trim() || formatTanggalIndonesia(issueDate);

    const validItems = items.filter(
      (item) => item.description?.trim() || (item.quantity > 0 && item.unit_price > 0)
    );
    if (validItems.length === 0) {
      alert('Minimal satu baris rincian pekerjaan harus diisi.');
      return;
    }

    // First save draft
    const saveRes = dataService.saveInvoiceDraft({
      id: initialInvoice?.id,
      clientId: selectedClientId || undefined,
      clientSnapshot: {
        sapaan,
        pic_name: resolvedPic,
        company_name: resolvedCompany,
        billing_address: billingAddress.trim(),
        email: email.trim(),
        whatsapp: whatsapp.trim(),
      },
      issueDate,
      dueDate,
      period: resolvedPeriod,
      items: validItems,
      discountType,
      discountValue: Number(discountValue) || 0,
      taxEnabled,
      taxRate: Number(taxRate) || 0,
      clientNotes,
      workTerms,
      paymentTerms,
      attachments,
      bankSnapshot: selectedBank,
      bankAccountsSnapshot: allBankAccounts,
      generalClauses,
    });

    if (!saveRes.success || !saveRes.invoice) {
      alert(saveRes.message);
      return;
    }

    const subRes = dataService.submitDraftForApproval(saveRes.invoice.id);
    if (subRes.success) {
      alert('Invoice berhasil diajukan untuk ditinjau oleh Owner/Admin.');
      onSaveSuccess(saveRes.invoice.id);
    } else {
      alert(subRes.message);
    }
  };

  // Direct Publish (Owner/Admin only)
  const handlePublishNow = async () => {
    if (currentUser.role !== 'OWNER' && currentUser.role !== 'ADMIN') {
      alert('Hanya Owner atau Admin yang berwenang menerbitkan invoice.');
      return;
    }

    if (!picName.trim() && !companyName.trim()) {
      alert('Nama penerima (PIC) atau nama perusahaan wajib diisi.');
      return;
    }
    if (!issueDate || !dueDate) {
      alert('Tanggal terbit dan jatuh tempo wajib diisi.');
      return;
    }
    if (new Date(dueDate) < new Date(issueDate)) {
      alert('Tanggal jatuh tempo tidak boleh sebelum tanggal terbit.');
      return;
    }

    const resolvedPic = picName.trim() || companyName.trim();
    const resolvedCompany = companyName.trim() || picName.trim();
    const resolvedPeriod = period.trim() || formatTanggalIndonesia(issueDate);

    const validItems = items.filter(
      (item) => item.description?.trim() || (item.quantity > 0 && item.unit_price > 0)
    );
    if (validItems.length === 0) {
      alert('Minimal satu baris rincian pekerjaan harus diisi.');
      return;
    }

    setIsSubmitting(true);
    try {
      const saveRes = dataService.saveInvoiceDraft({
        id: initialInvoice?.id,
        clientId: selectedClientId || undefined,
        clientSnapshot: {
          sapaan,
          pic_name: resolvedPic,
          company_name: resolvedCompany,
          billing_address: billingAddress.trim(),
          email: email.trim(),
          whatsapp: whatsapp.trim(),
        },
        issueDate,
        dueDate,
        period: resolvedPeriod,
        items: validItems,
        discountType,
        discountValue: Number(discountValue) || 0,
        taxEnabled,
        taxRate: Number(taxRate) || 0,
        clientNotes,
        workTerms,
        paymentTerms,
        attachments,
        bankSnapshot: selectedBank,
        bankAccountsSnapshot: allBankAccounts,
        generalClauses,
      });

      if (!saveRes.success || !saveRes.invoice) {
        alert(saveRes.message);
        setIsSubmitting(false);
        return;
      }

      const pubRes = await dataService.publishInvoice(saveRes.invoice.id);
      if (pubRes.success && pubRes.invoice) {
        alert(pubRes.message);
        onSaveSuccess(pubRes.invoice.id);
      } else {
        alert(pubRes.message);
      }
    } catch (err: any) {
      console.error('Error saat menerbitkan invoice:', err);
      alert('Terjadi kesalahan saat memproses penerbitan: ' + (err?.message || 'Error tidak diketahui'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const isOwnerAdmin = currentUser.role === 'OWNER' || currentUser.role === 'ADMIN';

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            title="Kembali"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                {isEditing ? `Edit Draft Invoice` : `Buat Invoice Baru`}
              </h1>
              {initialInvoice?.invoice_number && (
                <span className="px-2 py-0.5 rounded text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                  {initialInvoice.invoice_number}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              {initialInvoice?.invoice_number
                ? `Nomor invoice baru dan tanggal bulan berjalan telah dialokasikan. Anda dapat menyesuaikan rincian sebelum disimpan.`
                : `Form pembuatan invoice digital resmi.`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className={`px-3 py-2 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              showPreview
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Eye className="w-4 h-4" />
            {showPreview ? 'Kembali ke Form' : 'Lihat Preview Dokumen'}
          </button>

          <button
            type="button"
            onClick={handleSaveDraft}
            className="px-3.5 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Save className="w-4 h-4 text-slate-500" />
            Simpan Draft
          </button>

          {isOwnerAdmin ? (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handlePublishNow}
              className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              {isSubmitting ? 'Menerbitkan...' : 'Terbitkan Sekarang'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmitForApproval}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <Send className="w-4 h-4" />
              Ajukan untuk Ditinjau
            </button>
          )}
        </div>
      </div>

      {showPreview ? (
        /* Document Preview Component */
        <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-md space-y-6">
          <div className="flex justify-between items-start border-b border-slate-200 pb-6">
            <div>
              {settings.logo_url ? (
                <img
                  src={settings.logo_url}
                  alt="Logo"
                  className="max-h-14 max-w-44 object-contain mb-2"
                />
              ) : (
                <h2 className="text-xl font-black text-slate-900 tracking-tight">
                  {settings.publisher_name}
                </h2>
              )}
              <p className="text-xs text-slate-500 font-medium">
                {settings.publisher_city}, {settings.publisher_country}
              </p>
              <p className="text-xs text-slate-500">
                Telp: {settings.publisher_phone} | Email: {settings.publisher_email}
              </p>
            </div>

            <div className="text-right">
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                INVOICE DIGITAL TEAM
              </h2>
              <table className="text-xs text-slate-700 ml-auto mt-2">
                <tbody>
                  <tr>
                    <td className="text-slate-400 pr-2">Nomor Invoice:</td>
                    <td className="font-bold text-slate-900">
                      {initialInvoice?.invoice_number || 'DRAFT (Dialokasikan saat terbit)'}
                    </td>
                  </tr>
                  <tr>
                    <td className="text-slate-400 pr-2">Tanggal Terbit:</td>
                    <td className="font-medium">{formatTanggalIndonesia(issueDate)}</td>
                  </tr>
                  <tr>
                    <td className="text-slate-400 pr-2">Jatuh Tempo:</td>
                    <td className="font-medium">{formatTanggalIndonesia(dueDate)}</td>
                  </tr>
                  <tr>
                    <td className="text-slate-400 pr-2">Periode:</td>
                    <td className="font-medium">{period || '-'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Kepada */}
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Ditagihkan Kepada:
            </span>
            <p className="text-sm font-bold text-slate-900 mt-1">
              {sapaan} {picName || '(Nama PIC Penerima)'}
            </p>
            <p className="text-xs font-semibold text-slate-800">
              {companyName || '(Nama Perusahaan)'}
            </p>
            <p className="text-xs text-slate-600 whitespace-pre-line mt-0.5">
              {billingAddress || '(Alamat Penagihan)'}
            </p>
            {(whatsapp || email) && (
              <p className="text-xs text-slate-500 mt-1">
                {whatsapp && `WA: ${whatsapp}`} {email && `| Email: ${email}`}
              </p>
            )}
          </div>

          {/* Table */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-xs text-left text-slate-800">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3 w-12 text-center">No.</th>
                  <th className="py-2.5 px-3">Deskripsi Pekerjaan</th>
                  <th className="py-2.5 px-3 w-20 text-center">Qty</th>
                  <th className="py-2.5 px-3 w-24">Satuan</th>
                  <th className="py-2.5 px-3 w-32 text-right">Harga Satuan</th>
                  <th className="py-2.5 px-3 w-32 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item, idx) => (
                  <tr key={item.id}>
                    <td className="py-2.5 px-3 text-center text-slate-400">{idx + 1}</td>
                    <td className="py-2.5 px-3 font-medium whitespace-pre-line">
                      <span>{item.description || '-'}</span>
                      {item.currency === 'USD' && (
                        <div className="mt-1 flex items-center gap-1.5 text-[10px] text-emerald-800 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 w-fit">
                          <DollarSign className="w-3 h-3 text-emerald-600" />
                          <span>USD (Valas) • Kurs: Rp {formatAngka(item.custom_exchange_rate || customExchangeRate)} / $1</span>
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center">{item.quantity}</td>
                    <td className="py-2.5 px-3">{item.unit || '-'}</td>
                    <td className="py-2.5 px-3 text-right">
                      {item.currency === 'USD' ? (
                        <div>
                          <span className="font-bold text-slate-900">{formatUSD(item.unit_price_usd || 0)}</span>
                          <span className="text-[10px] text-slate-500 block">({formatRupiah(item.unit_price)})</span>
                        </div>
                      ) : (
                        formatRupiah(item.unit_price)
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold">
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

          {/* Valas Info Callout in Preview if USD items exist */}
          {hasUsdItems && (
            <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-lg text-xs text-emerald-900 flex items-start gap-2.5">
              <DollarSign className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Informasi Kurs Valuta Asing (USD):</span>
                <p className="text-[11px] text-emerald-800 mt-0.5">
                  Dokumen ini mencakup item dengan denominasi Dollar sebesar <strong>{formatUSD(totalUsdAmount)}</strong>. Nilai konversi resmi ke Rupiah dihitung berdasarkan kurs custom yang disepakati (Kurs acuan: {getExchangeRatesSummary(items, customExchangeRate)}).
                </p>
              </div>
            </div>
          )}

          {/* Totals & Terbilang */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-start pt-2">
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Terbilang:
              </span>
              <p className="text-xs font-semibold italic text-slate-800 leading-relaxed">
                "{terbilang}"
              </p>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Subtotal:</span>
                <span className="font-semibold text-slate-900">{formatRupiah(subtotal)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between py-1 border-b border-slate-100 text-amber-800">
                  <span>
                    Diskon ({discountType === 'percent' ? `${discountValue}%` : 'Nominal'}):
                  </span>
                  <span>- {formatRupiah(discountAmount)}</span>
                </div>
              )}
              {taxEnabled && (
                <div className="flex justify-between py-1 border-b border-slate-100 text-slate-700">
                  <span>Pajak ({taxRate}%):</span>
                  <span>+ {formatRupiah(taxAmount)}</span>
                </div>
              )}
              <div className="flex justify-between py-2 border-t-2 border-slate-900 font-bold text-sm text-slate-900">
                <span>Grand Total:</span>
                <span>{formatRupiah(grandTotal)}</span>
              </div>
            </div>
          </div>

          {/* General Clauses Preview (Klausul Umum Utuh) */}
          {generalClauses.filter((c) => c.is_active !== false).length > 0 && (
            <div className="pt-4 border-t border-slate-200 text-xs">
              <span className="text-[11px] font-bold text-slate-900 uppercase tracking-wider block mb-2">
                Klausul Umum / General Clauses (Syarat & Ketentuan):
              </span>
              <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 space-y-2">
                {generalClauses.filter((c) => c.is_active !== false).map((clause, cIdx) => (
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
          )}

          {/* Bank & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-slate-200 text-xs">
            <div>
              <span className="text-[11px] font-bold text-slate-900 uppercase tracking-wider block mb-1">
                Rekening Pembayaran:
              </span>
              <p className="text-slate-700 font-medium">Bank: {selectedBank.bank_name}</p>
              <p className="text-slate-900 font-bold text-sm">
                No. Rekening: {selectedBank.account_number}
              </p>
              <p className="text-slate-700 font-medium">A.N: {selectedBank.account_name}</p>
              {paymentTerms && (
                <p className="text-slate-500 mt-2 whitespace-pre-line text-[11px]">
                  {paymentTerms}
                </p>
              )}
            </div>

            <div>
              {clientNotes && (
                <div>
                  <span className="text-[11px] font-bold text-slate-900 uppercase tracking-wider block mb-1">
                    Catatan:
                  </span>
                  <p className="text-slate-600 whitespace-pre-line">{clientNotes}</p>
                </div>
              )}
              <div className="mt-4 text-right sm:text-left space-y-1">
                <p className="text-slate-500 font-medium">Hormat Kami,</p>
                <div className="h-12" />
                <p className="font-bold text-slate-900 border-b border-slate-300 pb-0.5 inline-block min-w-36">
                  {currentUser.full_name?.replace(/\s*\((Owner|Admin|Staff|Viewer)\)/gi, '').trim() || 'Riskha Ziaulhusna'}
                </p>
              </div>
            </div>
          </div>

          {/* Lampiran Dokumen Preview */}
          {attachments.length > 0 && (
            <div className="pt-6 border-t border-slate-200">
              <AttachmentManager
                attachments={attachments}
                readOnly={true}
                title="Lampiran Dokumen Resmi"
                subtitle="Berkas lampiran pendukung yang disertakan bersama invoice ini"
                showGoogleDriveSync={false}
              />
            </div>
          )}
        </div>
      ) : (
        /* Edit Form */
        <div className="space-y-6">
          {/* Banner Duplikat Invoice */}
          {initialInvoice?.invoice_number && (
            <div className="p-4 bg-indigo-50/90 border border-indigo-200 rounded-xl flex items-start gap-3 shadow-2xs">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                <Copy className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-xs text-indigo-950">
                    Dokumen Duplikat (Nomor Baru: {initialInvoice.invoice_number})
                  </span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-100 text-indigo-800 border border-indigo-200">
                    Bulan Berjalan: {period || formatBulanTahunBerjalan()}
                  </span>
                </div>
                <p className="text-[11px] text-indigo-900 mt-1">
                  Nomor invoice baru dan tanggal terbit telah dialokasikan otomatis. Seluruh rincian item pekerjaan, kuantitas, harga, dan ketentuan telah disalin dari invoice sebelumnya. Anda dapat mengubah jumlah, deskripsi, atau periode sesuai kebutuhan bulan berjalan sebelum menyimpan draft atau menerbitkannya.
                </p>
              </div>
            </div>
          )}

          {/* Section 1: Klien & Penerima */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-sm font-bold text-slate-900">1. Data Penerima & Klien</h2>
              {clients.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Pilih dari Master Klien:</span>
                  <select
                    value={selectedClientId}
                    onChange={(e) => handleClientSelect(e.target.value)}
                    className="text-xs bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-slate-800 focus:outline-none"
                  >
                    <option value="">-- Pilih Klien Terdaftar --</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.company_name} ({c.sapaan} {c.pic_name})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Sapaan <span className="text-rose-500">*</span>
                </label>
                <select
                  value={sapaan}
                  onChange={(e) => setSapaan(e.target.value as SapaanType)}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                >
                  <option value="Tn.">Tn. (Tuan)</option>
                  <option value="Ny.">Ny. (Nyonya)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Penerima / PIC <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Budi Santoso"
                  value={picName}
                  onChange={(e) => setPicName(e.target.value)}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Perusahaan <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Contoh: PT Kreatif Nusantara"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Alamat Penagihan
                </label>
                <textarea
                  rows={2}
                  placeholder="Alamat lengkap kantor / billing..."
                  value={billingAddress}
                  onChange={(e) => setBillingAddress(e.target.value)}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    placeholder="klien@perusahaan.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    WhatsApp (Format: 08... / 628...)
                  </label>
                  <input
                    type="text"
                    placeholder="08123456789"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Tanggal & Periode */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900">2. Tanggal & Periode Tagihan</h2>
                {initialInvoice?.invoice_number && (
                  <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                    No: <strong className="text-slate-800">{initialInvoice.invoice_number}</strong>
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={handleSyncToCurrentMonth}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                title="Sesuaikan tanggal terbit ke hari ini, jatuh tempo +14 hari, dan periode ke bulan berjalan"
              >
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                <span>Sinkronkan Bulan Berjalan</span>
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tanggal Terbit <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tanggal Jatuh Tempo <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Periode Tagihan / Pekerjaan <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Contoh: September 2026 / Q3 2026"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Item Pekerjaan */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">3. Rincian Item Pekerjaan</h2>
                <p className="text-[11px] text-slate-500">
                  Dukung teks multi-baris, kuantitas desimal, pilihan mata uang Dollar ($) / Rupiah (Rp), dan kurs dollar custom.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddItem}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors shadow-xs self-start sm:self-auto cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Tambah Baris Item
              </button>
            </div>

            {/* Opsi Mata Uang & Kurs Dollar Bar */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-bold text-slate-800">Opsi Mata Uang & Kurs Dollar (USD)</span>
                </div>
                {hasUsdItems && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                    Total Valas USD: {formatUSD(totalUsdAmount)}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                {/* Default Currency Selector */}
                <div className="sm:col-span-5">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Mata Uang Utama Invoice:
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCurrency('IDR')}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                        currency === 'IDR'
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span>🇮🇩 Rupiah (Rp)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrency('USD')}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                        currency === 'USD'
                          ? 'bg-emerald-700 text-white border-emerald-700'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span>🇺🇸 US Dollar ($)</span>
                    </button>
                  </div>
                </div>

                {/* Custom Dollar Exchange Rate Input */}
                <div className="sm:col-span-4">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Kurs Acuan Dollar Kustom:
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-2 text-xs font-bold text-slate-400">Rp</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      placeholder="16250"
                      value={customExchangeRate || ''}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setCustomExchangeRate(val);
                      }}
                      className="w-full pl-8 pr-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                    />
                  </div>
                </div>

                {/* Apply to All Button */}
                <div className="sm:col-span-3">
                  <button
                    type="button"
                    onClick={() => handleApplyExchangeRateToAllUSD(customExchangeRate)}
                    className="w-full py-1.5 px-2.5 rounded-lg border border-slate-300 hover:bg-white text-slate-700 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    title="Terapkan kurs ini ke seluruh baris item yang bermata uang Dollar"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                    <span>Terapkan ke Item USD</span>
                  </button>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 leading-normal flex items-start gap-1">
                <Info className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                <span>
                  Kurs dollar fluktuatif & dapat disesuaikan custom kapan saja. Pada tiap baris item di bawah, Anda bebas memilih apakah item menggunakan Rupiah atau Dollar beserta nominal harga dollarnya.
                </span>
              </p>
            </div>

            <div className="space-y-3">
              {items.map((item, index) => {
                const isUSD = item.currency === 'USD';
                return (
                  <div
                    key={item.id}
                    className={`p-3.5 rounded-lg space-y-2.5 border transition-colors ${
                      isUSD
                        ? 'bg-emerald-50/40 border-emerald-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-700">
                          {index + 1}
                        </span>
                        <span className="text-xs font-semibold text-slate-700">
                          Item #{index + 1}
                        </span>
                        {/* Currency Toggle for this item */}
                        <div className="ml-2 inline-flex items-center rounded-md bg-white border border-slate-200 p-0.5 text-[11px]">
                          <button
                            type="button"
                            onClick={() => handleUpdateItem(index, 'currency', 'IDR')}
                            className={`px-2 py-0.5 rounded font-semibold cursor-pointer transition-colors ${
                              !isUSD
                                ? 'bg-slate-800 text-white'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            Rp IDR
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateItem(index, 'currency', 'USD')}
                            className={`px-2 py-0.5 rounded font-semibold cursor-pointer transition-colors ${
                              isUSD
                                ? 'bg-emerald-700 text-white'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            $ USD
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => handleMoveItem(index, 'up')}
                          className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                          title="Geser Naik"
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          disabled={index === items.length - 1}
                          onClick={() => handleMoveItem(index, 'down')}
                          className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                          title="Geser Turun"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(index)}
                          className="p-1 text-rose-500 hover:text-rose-700 ml-1 cursor-pointer"
                          title="Hapus Item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-start">
                      {/* Description */}
                      <div className={isUSD ? "sm:col-span-5" : "sm:col-span-6"}>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Deskripsi Pekerjaan
                        </label>
                        <textarea
                          rows={2}
                          placeholder="Uraian pekerjaan..."
                          value={item.description}
                          onChange={(e) => handleUpdateItem(index, 'description', e.target.value)}
                          className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                        />
                      </div>

                      {/* Qty */}
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Qty (Kuantitas)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0"
                          value={item.quantity || ''}
                          onChange={(e) => handleUpdateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                          className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                        />
                      </div>

                      {/* Satuan */}
                      <div className={isUSD ? "sm:col-span-1" : "sm:col-span-2"}>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Satuan
                        </label>
                        <input
                          type="text"
                          placeholder="bln/unit"
                          value={item.unit}
                          onChange={(e) => handleUpdateItem(index, 'unit', e.target.value)}
                          className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                        />
                      </div>

                      {/* USD Price and Exchange Rate or Rupiah Price */}
                      {isUSD ? (
                        <>
                          <div className="sm:col-span-2">
                            <label className="block text-[11px] font-medium text-emerald-800 mb-1">
                              Harga Satuan ($ USD)
                            </label>
                            <div className="relative">
                              <span className="absolute left-2.5 top-2 text-xs font-bold text-emerald-700">$</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="0.00"
                                value={item.unit_price_usd || ''}
                                onChange={(e) => handleUpdateItem(index, 'unit_price_usd', parseFloat(e.target.value) || 0)}
                                className="w-full pl-6 pr-2 py-2 bg-white border border-emerald-300 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                              />
                            </div>
                          </div>

                          <div className="sm:col-span-2">
                            <label className="block text-[11px] font-medium text-emerald-800 mb-1">
                              Kurs Dollar Kustom (Rp)
                            </label>
                            <div className="relative">
                              <span className="absolute left-2 top-2 text-[10px] font-bold text-slate-400">Rp</span>
                              <input
                                type="number"
                                min="1"
                                step="1"
                                placeholder={String(customExchangeRate)}
                                value={item.custom_exchange_rate || ''}
                                onChange={(e) => handleUpdateItem(index, 'custom_exchange_rate', parseFloat(e.target.value) || 0)}
                                className="w-full pl-7 pr-2 py-2 bg-white border border-emerald-300 rounded-lg text-xs font-mono font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                                title="Kurs dollar custom khusus untuk baris item ini"
                              />
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-medium text-slate-600 mb-1">
                            Harga Satuan (Rp)
                          </label>
                          <input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={item.unit_price || ''}
                            onChange={(e) => handleUpdateItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                            className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                          />
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs pt-2 border-t border-slate-200">
                      {isUSD ? (
                        <div className="text-[11px] text-emerald-800 flex items-center gap-1.5">
                          <span className="font-semibold">Konversi:</span>
                          <span>
                            $ {(item.unit_price_usd || 0).toFixed(2)} @ Rp {formatAngka(item.custom_exchange_rate || customExchangeRate)} = <strong>{formatRupiah(item.unit_price)}</strong> / {item.unit || 'unit'}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400">Mata uang: Rupiah (IDR)</span>
                      )}

                      <div className="text-right">
                        <span className="text-slate-500">Total Baris: </span>
                        {isUSD && (
                          <span className="text-emerald-700 font-bold mr-1.5">
                            {formatUSD(item.total_usd || 0)} (Setara)
                          </span>
                        )}
                        <span className="font-bold text-slate-900">{formatRupiah(item.total)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 4: Diskon, Pajak & Total */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
              4. Diskon, Pajak & Rekapitulasi
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Controls */}
              <div className="space-y-4">
                {/* Diskon */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-800">Diskon (Opsional)</label>
                    <div className="flex items-center gap-2 text-xs">
                      <label className="inline-flex items-center gap-1 cursor-pointer">
                        <input
                          type="radio"
                          name="discountType"
                          checked={discountType === 'percent'}
                          onChange={() => setDiscountType('percent')}
                        />
                        <span>Persen (%)</span>
                      </label>
                      <label className="inline-flex items-center gap-1 cursor-pointer">
                        <input
                          type="radio"
                          name="discountType"
                          checked={discountType === 'nominal'}
                          onChange={() => setDiscountType('nominal')}
                        />
                        <span>Nominal (Rp)</span>
                      </label>
                    </div>
                  </div>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={discountValue || ''}
                    onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                    className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                  />
                </div>

                {/* Pajak */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-800">
                      Pajak (PPN / PPh)
                    </label>
                    <label className="inline-flex items-center gap-1.5 text-xs font-medium cursor-pointer">
                      <input
                        type="checkbox"
                        checked={taxEnabled}
                        onChange={(e) => setTaxEnabled(e.target.checked)}
                        className="rounded"
                      />
                      <span>Aktifkan Pajak</span>
                    </label>
                  </div>
                  {taxEnabled && (
                    <div>
                      <label className="block text-[11px] text-slate-600 mb-1">
                        Tarif Pajak (%):
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        placeholder="Contoh: 11"
                        value={taxRate || ''}
                        onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                        className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Summary Numbers */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal:</span>
                  <span className="font-semibold text-slate-900">{formatRupiah(subtotal)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-amber-800 font-medium">
                    <span>Potongan Diskon:</span>
                    <span>- {formatRupiah(discountAmount)}</span>
                  </div>
                )}
                {taxEnabled && (
                  <div className="flex justify-between text-slate-700 font-medium">
                    <span>Nilai Pajak ({taxRate}%):</span>
                    <span>+ {formatRupiah(taxAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-slate-200 text-sm font-bold text-slate-900">
                  <span>Grand Total:</span>
                  <span>{formatRupiah(grandTotal)}</span>
                </div>

                <div className="pt-3 border-t border-slate-200">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 block mb-1">
                    Terbilang:
                  </span>
                  <p className="text-xs italic font-medium text-slate-800 leading-snug">
                    "{terbilang}"
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Section 5: Rekening Bank, Klausul Umum & Ketentuan */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-6">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
              5. Rekening Tujuan, Klausul Umum & Ketentuan Pembayaran
            </h2>

            {/* Pilihan Rekening Bank Tujuan */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-indigo-600" />
                <label className="text-xs font-bold text-slate-800">
                  Rekening Bank Tujuan Pembayaran
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {allBankAccounts.map((acc) => {
                  const isSelected = selectedBank.account_number === acc.account_number;
                  return (
                    <div
                      key={acc.id}
                      onClick={() =>
                        setSelectedBank({
                          bank_name: acc.bank_name,
                          account_number: acc.account_number,
                          account_name: acc.account_name,
                        })
                      }
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600'
                          : 'border-slate-200 hover:border-slate-300 bg-slate-50'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-slate-900">{acc.bank_name}</span>
                          <div className="flex items-center gap-1.5">
                            {acc.is_default && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 font-semibold">
                                Default
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={(e) => handleDeleteBankFromForm(e, acc.id, acc.bank_name)}
                              className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                              title="Hapus rekening pembayaran ini"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <p className="font-mono font-bold text-xs text-slate-800 mt-1 select-all">
                          {acc.account_number}
                        </p>
                        <p className="text-[11px] text-slate-600 truncate mt-0.5">
                          a.n. {acc.account_name}
                        </p>
                      </div>
                      <div className="pt-2 mt-2 border-t border-slate-200 flex items-center justify-between text-[11px]">
                        <span className={isSelected ? 'font-bold text-indigo-700' : 'text-slate-400'}>
                          {isSelected ? '✓ Terpilih untuk Tagihan' : 'Pilih Rekening Ini'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Klausul Umum Dokumen (General Clauses) */}
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-600" />
                  <div>
                    <label className="text-xs font-bold text-slate-800">
                      Klausul Umum Dokumen (General Clauses)
                    </label>
                    <p className="text-[11px] text-slate-500">
                      Klausul yang dicentang akan tercetak secara utuh pada berkas PDF resmi invoice ini.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddClauseInline(!showAddClauseInline)}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center gap-1 transition-colors self-start sm:self-auto cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Klausul Khusus</span>
                </button>
              </div>

              {/* Inline Form Tambah Klausul */}
              {showAddClauseInline && (
                <div className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/40 space-y-3 text-xs">
                  <span className="font-bold text-slate-900 block">Tambah Klausul Baru untuk Invoice Ini</span>
                  <div>
                    <input
                      type="text"
                      placeholder="Judul klausul (opsional, contoh: Deliverables, Ketentuan Khusus)"
                      value={newClauseTitle}
                      onChange={(e) => setNewClauseTitle(e.target.value)}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                    />
                  </div>
                  <div>
                    <textarea
                      rows={2}
                      placeholder="Isi klausul lengkap..."
                      value={newClauseContent}
                      onChange={(e) => setNewClauseContent(e.target.value)}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddClauseInline(false)}
                      className="px-3 py-1 rounded bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!newClauseContent.trim()) {
                          alert('Isi klausul wajib diisi.');
                          return;
                        }
                        const newC: GeneralClause = {
                          id: 'clause-' + Date.now().toString(36),
                          title: newClauseTitle.trim() || `Klausul ${generalClauses.length + 1}`,
                          content: newClauseContent.trim(),
                          is_active: true,
                        };
                        setGeneralClauses([...generalClauses, newC]);
                        setNewClauseTitle('');
                        setNewClauseContent('');
                        setShowAddClauseInline(false);
                      }}
                      className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                    >
                      Tambahkan
                    </button>
                  </div>
                </div>
              )}

              {/* Daftar Klausul */}
              <div className="space-y-2.5">
                {generalClauses.map((clause, idx) => {
                  const isActive = clause.is_active !== false;
                  return (
                    <div
                      key={clause.id || idx}
                      className={`p-3 rounded-lg border text-xs transition-colors space-y-2 ${
                        isActive
                          ? 'bg-slate-50 border-slate-200'
                          : 'bg-slate-50/40 border-dashed border-slate-300 opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1">
                          <input
                            type="checkbox"
                            checked={isActive}
                            onChange={(e) => {
                              const updated = [...generalClauses];
                              updated[idx] = { ...updated[idx], is_active: e.target.checked };
                              setGeneralClauses(updated);
                            }}
                            className="rounded text-blue-600 cursor-pointer"
                          />
                          <span className="font-bold text-slate-700 text-xs shrink-0">
                            {idx + 1}.
                          </span>
                          <input
                            type="text"
                            value={clause.title || ''}
                            placeholder={idx === 0 ? 'General Clause (Default)' : `Judul Klausul ${idx + 1}`}
                            onChange={(e) => {
                              const updated = [...generalClauses];
                              updated[idx] = { ...updated[idx], title: e.target.value };
                              setGeneralClauses(updated);
                            }}
                            className="font-bold text-xs bg-transparent border-b border-transparent hover:border-slate-300 focus:border-slate-900 focus:bg-white focus:outline-none px-1.5 py-0.5 rounded text-slate-900 flex-1 min-w-32"
                          />
                          {idx === 0 && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0">
                              Klausul Pertama (Default)
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteClauseFromForm(idx)}
                          className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-1.5 rounded transition-colors cursor-pointer shrink-0"
                          title="Hapus klausul ini dari invoice"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <textarea
                        rows={2}
                        value={clause.content}
                        onChange={(e) => {
                          const updated = [...generalClauses];
                          updated[idx] = { ...updated[idx], content: e.target.value };
                          setGeneralClauses(updated);
                        }}
                        className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900 leading-relaxed"
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Catatan Klien & Ketentuan Pembayaran */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Catatan untuk Klien
                </label>
                <textarea
                  rows={3}
                  value={clientNotes}
                  onChange={(e) => setClientNotes(e.target.value)}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ketentuan Pembayaran
                </label>
                <textarea
                  rows={3}
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>
            </div>
          </div>

          {/* Section 6: Lampiran Dokumen Pendukung */}
          <AttachmentManager
            title="6. Lampiran Dokumen Pendukung"
            subtitle="Unggah PO / Surat Pesanan, Berita Acara (BAST), Kontrak/SPK, Bukti Pekerjaan, atau Faktur Pajak sebagai lampiran resmi invoice ini"
            attachments={attachments}
            onChange={setAttachments}
            readOnly={false}
            canUpload={true}
            canDelete={true}
            currentUserName={currentUser.full_name}
            invoiceNumber={initialInvoice?.invoice_number || 'DRAFT'}
            showGoogleDriveSync={false}
          />
        </div>
      )}

      {/* In-App Confirmation Modal */}
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
