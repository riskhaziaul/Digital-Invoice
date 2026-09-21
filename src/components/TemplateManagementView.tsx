import React, { useState } from 'react';
import {
  MessageSquare,
  Save,
  RotateCcw,
  Sparkles,
  AlertCircle,
  Copy,
  Check,
  Eye,
} from 'lucide-react';
import { MessageTemplate, UserProfile } from '../types';
import { dataService } from '../lib/data-service';
import { DEFAULT_MESSAGE_TEMPLATES } from '../lib/constants';

interface TemplateManagementViewProps {
  currentUser: UserProfile;
}

export const TemplateManagementView: React.FC<TemplateManagementViewProps> = ({ currentUser }) => {
  const [templates, setTemplates] = useState<MessageTemplate[]>(dataService.getTemplates());
  const [activeTemplateId, setActiveTemplateId] = useState<string>(templates[0]?.id || '');
  const [copiedVar, setCopiedVar] = useState<string | null>(null);

  const activeTemplate = templates.find((t) => t.id === activeTemplateId) || templates[0];
  const [editBody, setEditBody] = useState(activeTemplate?.body || '');
  const [editName, setEditName] = useState(activeTemplate?.name || activeTemplate?.title || '');

  const canEdit = currentUser.role === 'OWNER' || currentUser.role === 'ADMIN' || currentUser.role === 'STAFF';

  const handleSelectTemplate = (t: MessageTemplate) => {
    setActiveTemplateId(t.id);
    setEditBody(t.body);
    setEditName(t.name || t.title || '');
  };

  const handleInsertVariable = (variableKey: string) => {
    setEditBody((prev) => prev + variableKey);
  };

  const handleSave = () => {
    if (!canEdit) {
      alert('Anda tidak memiliki izin mengedit template pesan.');
      return;
    }
    const res = dataService.updateTemplate(activeTemplate.id, {
      name: editName,
      body: editBody,
    });
    alert(res.message);
    if (res.success) {
      setTemplates(dataService.getTemplates());
    }
  };

  const handleResetToDefault = () => {
    if (!canEdit) return;
    const def = DEFAULT_MESSAGE_TEMPLATES.find((t) => t.type === activeTemplate.type);
    if (def) {
      setEditName(def.name || def.title || '');
      setEditBody(def.body);
      const res = dataService.updateTemplate(activeTemplate.id, {
        name: def.name || def.title || '',
        body: def.body,
      });
      alert('Template berhasil dikembalikan ke format standar.');
      setTemplates(dataService.getTemplates());
    }
  };

  const availableVariables = [
    { key: '{Sapaan}', desc: 'Tn. atau Ny.' },
    { key: '{Nama}', desc: 'Nama lengkap PIC penerima' },
    { key: '{Perusahaan}', desc: 'Nama perusahaan klien' },
    { key: '{NomorInvoice}', desc: 'Nomor resmi invoice' },
    { key: '{TanggalInvoice}', desc: 'Tanggal terbit dokumen' },
    { key: '{JatuhTempo}', desc: 'Tanggal jatuh tempo pembayaran' },
    { key: '{Periode}', desc: 'Periode pekerjaan / penagihan' },
    { key: '{GrandTotal}', desc: 'Total nilai tagihan (Rp)' },
    { key: '{PembayaranDiterima}', desc: 'Total pembayaran yang telah masuk' },
    { key: '{SisaTagihan}', desc: 'Sisa saldo tertunggak' },
    { key: '{LinkInvoice}', desc: 'Tautan web resmi penerima' },
    { key: '{LinkPDF}', desc: 'Tautan unduh langsung file PDF' },
    { key: '{NamaPengirim}', desc: 'Nama pengirim / divisi penagihan' },
  ];

  // Detect unknown variables: any {xyz} not in available list
  const allowedSet = new Set(availableVariables.map((v) => v.key));
  const foundPlaceholders = editBody.match(/\{[a-zA-Z0-9_]+\}/g) || [];
  const unknownPlaceholders = foundPlaceholders.filter((p) => !allowedSet.has(p));

  // Simulation preview text
  const previewText = editBody
    .replace(/\{Sapaan\}/g, 'Tn.')
    .replace(/\{Nama\}/g, 'Budi Santoso')
    .replace(/\{Perusahaan\}/g, 'PT Kreatif Nusantara')
    .replace(/\{NomorInvoice\}/g, 'INV/DIGITAL/IX/26-0001')
    .replace(/\{TanggalInvoice\}/g, '21 September 2026')
    .replace(/\{JatuhTempo\}/g, '28 September 2026')
    .replace(/\{Periode\}/g, 'September 2026')
    .replace(/\{GrandTotal\}/g, 'Rp 15.000.000')
    .replace(/\{PembayaranDiterima\}/g, 'Rp 5.000.000')
    .replace(/\{SisaTagihan\}/g, 'Rp 10.000.000')
    .replace(/\{LinkInvoice\}/g, 'https://invoicedigital.id/invoice/token-resmi-123')
    .replace(/\{LinkPDF\}/g, 'https://invoicedigital.id/invoice/token-resmi-123/pdf')
    .replace(/\{NamaPengirim\}/g, 'Riskha Ziaulhusna (Digital & Marcomm Team)');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Template Pesan Pengiriman</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Format pesan WhatsApp / Email dinamis dengan variabel otomatis untuk setiap tahap invoice.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Template Selector List */}
        <div className="lg:col-span-4 space-y-2">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block px-1">
            Pilih Jenis Pesan:
          </span>
          <div className="space-y-1.5">
            {templates.map((tpl) => {
              const isSelected = tpl.id === activeTemplate.id;
              return (
                <button
                  key={tpl.id}
                  onClick={() => handleSelectTemplate(tpl)}
                  className={`w-full text-left p-3.5 rounded-xl border transition-colors flex items-center justify-between ${
                    isSelected
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                      : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div>
                    <h4 className="text-xs font-bold">{tpl.name || tpl.title}</h4>
                    <p
                      className={`text-[10px] mt-0.5 ${
                        isSelected ? 'text-slate-300' : 'text-slate-400'
                      }`}
                    >
                      Tipe: {tpl.type}
                    </p>
                  </div>
                  <MessageSquare className="w-4 h-4 shrink-0" />
                </button>
              );
            })}
          </div>

          {/* Quick Info Box */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 space-y-1">
            <h5 className="font-bold">Ketentuan Pesan Resmi:</h5>
            <p className="text-[11px] leading-relaxed">
              Sapaan wajib menggunakan Tn. atau Ny. Tautan yang dikirimkan hanya mengarah ke halaman
              invoice publik atau PDF, bukan ke dashboard internal.
            </p>
          </div>
        </div>

        {/* Editor & Preview Column */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <input
                  type="text"
                  value={editName}
                  disabled={!canEdit}
                  onChange={(e) => setEditName(e.target.value)}
                  className="text-sm font-bold text-slate-900 bg-transparent border-b border-dashed border-slate-300 focus:outline-none focus:border-slate-900"
                />
                <p className="text-[11px] text-slate-400 mt-0.5">Kode Tipe: {activeTemplate.type}</p>
              </div>

              {canEdit && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleResetToDefault}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-medium flex items-center gap-1"
                    title="Kembalikan ke standar awal"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset
                  </button>
                  <button
                    onClick={handleSave}
                    className="px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Simpan Template
                  </button>
                </div>
              )}
            </div>

            {/* Variable Chips */}
            <div>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                Klik variabel untuk menyisipkan ke isi pesan:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {availableVariables.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => handleInsertVariable(v.key)}
                    title={v.desc}
                    className="text-[11px] font-mono px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded border border-slate-200 transition-colors cursor-pointer disabled:cursor-default"
                  >
                    {v.key}
                  </button>
                ))}
              </div>
            </div>

            {/* Template Body Textarea */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Format Pesan Master:
              </label>
              <textarea
                rows={9}
                value={editBody}
                disabled={!canEdit}
                onChange={(e) => setEditBody(e.target.value)}
                className="w-full text-xs p-3.5 bg-slate-50 border border-slate-200 rounded-lg font-mono leading-relaxed focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>

            {/* Unknown placeholder alert */}
            {unknownPlaceholders.length > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2 text-xs text-amber-800">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Peringatan Variabel: </span>
                  Ditemukan placeholder yang tidak dikenali sistem:{' '}
                  <span className="font-mono font-bold">{unknownPlaceholders.join(', ')}</span>.
                  Pastikan ejaan sesuai dengan daftar di atas.
                </div>
              </div>
            )}

            {/* Simulation Preview */}
            <div className="pt-4 border-t border-slate-100">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-2">
                <Eye className="w-4 h-4 text-slate-500" />
                <span>Simulasi Tampilan Pesan Hasil Generate:</span>
              </div>
              <div className="p-4 bg-slate-100 rounded-xl border border-slate-200 text-xs text-slate-800 whitespace-pre-line font-sans leading-relaxed">
                {previewText}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
