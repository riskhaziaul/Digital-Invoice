import React, { useState, useMemo } from 'react';
import {
  Building2,
  Plus,
  Search,
  Edit2,
  Trash2,
  User,
  Phone,
  Mail,
  MapPin,
  FileText,
  Lock,
} from 'lucide-react';
import { Client, SapaanType, UserProfile } from '../types';
import { dataService } from '../lib/data-service';

interface ClientManagementViewProps {
  clients: Client[];
  currentUser: UserProfile;
  allUsers: UserProfile[];
  onRefresh: () => void;
}

export const ClientManagementView: React.FC<ClientManagementViewProps> = ({
  clients,
  currentUser,
  allUsers,
  onRefresh,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);

  // Form states
  const [sapaan, setSapaan] = useState<SapaanType>('Tn.');
  const [picName, setPicName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [assignedStaffId, setAssignedStaffId] = useState('');

  const canManage = currentUser.role !== 'VIEWER';

  const filteredClients = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return clients.filter(
      (c) =>
        !q ||
        c.pic_name.toLowerCase().includes(q) ||
        c.company_name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.whatsapp.includes(q)
    );
  }, [clients, searchTerm]);

  const handleOpenAdd = () => {
    setEditingClient(null);
    setSapaan('Tn.');
    setPicName('');
    setCompanyName('');
    setBillingAddress('');
    setEmail('');
    setWhatsapp('');
    setInternalNotes('');
    setAssignedStaffId(currentUser.id);
    setShowModal(true);
  };

  const handleOpenEdit = (client: Client) => {
    setEditingClient(client);
    setSapaan(client.sapaan);
    setPicName(client.pic_name);
    setCompanyName(client.company_name);
    setBillingAddress(client.billing_address);
    setEmail(client.email);
    setWhatsapp(client.whatsapp);
    setInternalNotes(client.internal_notes || '');
    setAssignedStaffId(client.assigned_staff_id || '');
    setShowModal(true);
  };

  const handleSaveClient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!picName.trim() || !companyName.trim()) {
      alert('Nama PIC dan Nama Perusahaan wajib diisi.');
      return;
    }

    const assignedStaff = allUsers.find((u) => u.id === assignedStaffId);

    const res = dataService.saveClient({
      id: editingClient?.id,
      sapaan,
      pic_name: picName.trim(),
      company_name: companyName.trim(),
      billing_address: billingAddress.trim(),
      email: email.trim(),
      whatsapp: whatsapp.trim(),
      internal_notes: internalNotes.trim(),
      assigned_user_ids: assignedStaffId ? [assignedStaffId] : [],
      assigned_staff_id: assignedStaffId || undefined,
      assigned_staff_name: assignedStaff?.full_name || undefined,
    });

    alert(res.message);
    if (res.success) {
      setShowModal(false);
      onRefresh();
    }
  };

  const handleDeleteClient = (client: Client) => {
    if (currentUser.role !== 'OWNER' && currentUser.role !== 'ADMIN') {
      alert('Hanya Owner atau Admin yang dapat menghapus klien.');
      return;
    }
    if (confirm(`Hapus data klien ${client.company_name}? Invoice yang telah terbit sebelumnya tidak akan terpengaruh.`)) {
      const res = dataService.deleteClient(client.id);
      alert(res.message);
      if (res.success) onRefresh();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Manajemen Master Klien</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Kelola data kontak & alamat penagihan. Perubahan data di sini tidak merusak riwayat invoice yang telah terbit.
          </p>
        </div>
        {canManage && (
          <button
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold tracking-wide transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" />
            Tambah Klien Baru
          </button>
        )}
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200">
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Cari berdasarkan nama, perusahaan, email, atau no HP..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
          />
        </div>
      </div>

      {/* Client List */}
      {clients.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400 mb-4">
            <Building2 className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-800">Belum ada data klien</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1.5 mb-6">
            Daftar klien masih kosong. Daftarkan klien pertama Anda agar pengisian invoice lebih cepat dan konsisten.
          </p>
          {canManage && (
            <button
              onClick={handleOpenAdd}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold tracking-wide transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4" />
              Tambah Klien Pertama
            </button>
          )}
        </div>
      ) : filteredClients.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400 text-xs">
          Tidak ditemukan data klien yang cocok dengan pencarian Anda.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredClients.map((client) => (
            <div
              key={client.id}
              className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-colors"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 leading-snug">
                      {client.company_name}
                    </h3>
                    <p className="text-xs font-medium text-slate-700 mt-0.5">
                      {client.sapaan} {client.pic_name}
                    </p>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                    {client.sapaan}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-slate-600 pt-2 border-t border-slate-100">
                  {client.billing_address && (
                    <div className="flex items-start gap-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                      <span className="line-clamp-2">{client.billing_address}</span>
                    </div>
                  )}
                  {client.whatsapp && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{client.whatsapp}</span>
                    </div>
                  )}
                  {client.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{client.email}</span>
                    </div>
                  )}
                </div>

                {client.internal_notes && (
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-500">
                    <div className="flex items-center gap-1 font-semibold text-slate-700 mb-0.5">
                      <Lock className="w-3 h-3 text-slate-400" />
                      <span>Catatan Internal (Rahasia)</span>
                    </div>
                    <p className="line-clamp-2">{client.internal_notes}</p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100 text-xs">
                <span className="text-[10px] text-slate-400">
                  PIC Staff: {client.assigned_staff_name || '-'}
                </span>

                {canManage && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEdit(client)}
                      className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded"
                      title="Edit Klien"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    {(currentUser.role === 'OWNER' || currentUser.role === 'ADMIN') && (
                      <button
                        onClick={() => handleDeleteClient(client)}
                        className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded"
                        title="Hapus Klien"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
              {editingClient ? 'Edit Data Klien' : 'Tambah Klien Baru'}
            </h3>

            <form onSubmit={handleSaveClient} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Sapaan <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={sapaan}
                    onChange={(e) => setSapaan(e.target.value as SapaanType)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                  >
                    <option value="Tn.">Tn. (Tuan)</option>
                    <option value="Ny.">Ny. (Nyonya)</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nama Penerima / PIC <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Budi Santoso"
                    value={picName}
                    onChange={(e) => setPicName(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nama Perusahaan <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: PT Kreatif Nusantara Digital"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Alamat Penagihan</label>
                <textarea
                  rows={2}
                  placeholder="Alamat kantor..."
                  value={billingAddress}
                  onChange={(e) => setBillingAddress(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">WhatsApp</label>
                  <input
                    type="text"
                    placeholder="081234567890"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    placeholder="klien@perusahaan.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Penanggung Jawab (Staf Internal)
                </label>
                <select
                  value={assignedStaffId}
                  onChange={(e) => setAssignedStaffId(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                >
                  <option value="">-- Pilih Staf --</option>
                  {allUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} ({u.role})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Catatan Internal (Hanya Terlihat oleh Tim Internal)
                </label>
                <textarea
                  rows={2}
                  placeholder="Catatan khusus kesepakatan, termin, dll..."
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold shadow-xs"
                >
                  Simpan Klien
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
