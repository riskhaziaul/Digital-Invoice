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
} from 'lucide-react';
import {
  Client,
  Invoice,
  InvoiceItem,
  SapaanType,
  UserProfile,
} from '../types';
import { angkaKeTerbilang, formatRupiah, formatTanggalIndonesia } from '../lib/terbilang';
import { dataService } from '../lib/data-service';

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

  // Items
  const [items, setItems] = useState<InvoiceItem[]>(
    initialInvoice?.current_version.items && initialInvoice.current_version.items.length > 0
      ? initialInvoice.current_version.items
      : [
          {
            id: 'item-' + Date.now(),
            sort_order: 1,
            description: '',
            quantity: 0,
            unit: 'bulan',
            unit_price: 0,
            total: 0,
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
  const [clientNotes, setClientNotes] = useState(
    initialInvoice?.current_version.client_notes || settings.default_client_notes || ''
  );
  const [workTerms, setWorkTerms] = useState(
    initialInvoice?.current_version.work_terms || settings.default_work_terms || ''
  );
  const [paymentTerms, setPaymentTerms] = useState(
    initialInvoice?.current_version.payment_terms || settings.default_payment_terms || ''
  );

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
      },
    ]);
  };

  const handleUpdateItem = (
    index: number,
    field: keyof InvoiceItem,
    value: string | number
  ) => {
    const updated = [...items];
    const target = { ...updated[index], [field]: value };

    if (field === 'quantity' || field === 'unit_price') {
      const q = Number(target.quantity) || 0;
      const p = Number(target.unit_price) || 0;
      target.total = Math.round(q * p * 100) / 100;
    }

    updated[index] = target;
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
      discountType,
      discountValue: Number(discountValue) || 0,
      taxEnabled,
      taxRate: Number(taxRate) || 0,
      clientNotes,
      workTerms,
      paymentTerms,
    });

    if (result.success && result.invoice) {
      alert(result.message);
      onSaveSuccess(result.invoice.id);
    } else {
      alert(result.message);
    }
  };

  // Submit Draft for Approval (Staff)
  const handleSubmitForApproval = () => {
    if (!picName.trim() || !companyName.trim()) {
      alert('Nama penerima dan perusahaan wajib diisi sebelum mengajukan.');
      return;
    }
    if (!issueDate || !dueDate || !period.trim()) {
      alert('Tanggal terbit, jatuh tempo, dan periode wajib diisi.');
      return;
    }

    // First save draft
    const saveRes = dataService.saveInvoiceDraft({
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
      discountType,
      discountValue: Number(discountValue) || 0,
      taxEnabled,
      taxRate: Number(taxRate) || 0,
      clientNotes,
      workTerms,
      paymentTerms,
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

    if (!picName.trim() || !companyName.trim()) {
      alert('Penerima dan Perusahaan wajib diisi.');
      return;
    }
    if (!issueDate || !dueDate || !period.trim()) {
      alert('Tanggal terbit, jatuh tempo, dan periode wajib diisi.');
      return;
    }
    if (new Date(dueDate) < new Date(issueDate)) {
      alert('Tanggal jatuh tempo tidak boleh sebelum tanggal terbit.');
      return;
    }

    setIsSubmitting(true);
    try {
      const saveRes = dataService.saveInvoiceDraft({
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
        discountType,
        discountValue: Number(discountValue) || 0,
        taxEnabled,
        taxRate: Number(taxRate) || 0,
        clientNotes,
        workTerms,
        paymentTerms,
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
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              {isEditing ? `Edit Draft Invoice` : `Buat Invoice Baru`}
            </h1>
            <p className="text-xs text-slate-500">
              Form diawali dalam kondisi bersih tanpa data lama otomatis.
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
                      {item.description || '-'}
                    </td>
                    <td className="py-2.5 px-3 text-center">{item.quantity}</td>
                    <td className="py-2.5 px-3">{item.unit || '-'}</td>
                    <td className="py-2.5 px-3 text-right">{formatRupiah(item.unit_price)}</td>
                    <td className="py-2.5 px-3 text-right font-bold">{formatRupiah(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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

          {/* Bank & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-slate-200 text-xs">
            <div>
              <span className="text-[11px] font-bold text-slate-900 uppercase tracking-wider block mb-1">
                Rekening Pembayaran:
              </span>
              <p className="text-slate-700 font-medium">Bank: {settings.bank_name}</p>
              <p className="text-slate-900 font-bold text-sm">
                No. Rekening: {settings.bank_account_no}
              </p>
              <p className="text-slate-700 font-medium">A.N: {settings.bank_account_name}</p>
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
              <div className="mt-4 text-right sm:text-left">
                <p className="text-slate-500">Hormat Kami,</p>
                <p className="font-bold text-slate-900 mt-8">{settings.publisher_name}</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Edit Form */
        <div className="space-y-6">
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
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
              2. Tanggal & Periode Tagihan
            </h2>
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
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">3. Rincian Item Pekerjaan</h2>
                <p className="text-[11px] text-slate-500">
                  Dukung teks multi-baris, kuantitas desimal, dan penataan urutan item.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddItem}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                Tambah Baris Item
              </button>
            </div>

            <div className="space-y-3">
              {items.map((item, index) => (
                <div
                  key={item.id}
                  className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-700">
                        {index + 1}
                      </span>
                      <span className="text-xs font-semibold text-slate-700">
                        Item #{index + 1}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => handleMoveItem(index, 'up')}
                        className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                        title="Geser Naik"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        disabled={index === items.length - 1}
                        onClick={() => handleMoveItem(index, 'down')}
                        className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                        title="Geser Turun"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(index)}
                        className="p-1 text-rose-500 hover:text-rose-700 ml-1"
                        title="Hapus Item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-start">
                    {/* Description */}
                    <div className="sm:col-span-6">
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
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Satuan
                      </label>
                      <input
                        type="text"
                        placeholder="bulan/hari/unit"
                        value={item.unit}
                        onChange={(e) => handleUpdateItem(index, 'unit', e.target.value)}
                        className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                      />
                    </div>

                    {/* Harga Satuan */}
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
                  </div>

                  <div className="text-right text-xs pt-1 border-t border-slate-200">
                    <span className="text-slate-500">Total Baris: </span>
                    <span className="font-bold text-slate-900">{formatRupiah(item.total)}</span>
                  </div>
                </div>
              ))}
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

          {/* Section 5: Catatan & Ketentuan */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
              5. Catatan & Ketentuan Pembayaran
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
        </div>
      )}
    </div>
  );
};
