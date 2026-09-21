import React, { useState } from 'react';
import {
  UserCheck,
  Plus,
  Shield,
  UserX,
  Lock,
  Mail,
  User,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { UserProfile, UserRole } from '../types';
import { dataService } from '../lib/data-service';

interface UserManagementViewProps {
  currentUser: UserProfile;
  allUsers: UserProfile[];
  onRefresh: () => void;
}

export const UserManagementView: React.FC<UserManagementViewProps> = ({
  currentUser,
  allUsers,
  onRefresh,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('STAFF');

  if (currentUser.role !== 'OWNER') {
    return (
      <div className="bg-white p-8 rounded-xl border border-slate-200 text-center max-w-md mx-auto my-12 space-y-3">
        <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
          <Lock className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-slate-900">Akses Ditolak</h3>
        <p className="text-xs text-slate-500">
          Halaman Pengguna & Hak Akses khusus untuk peran OWNER.
        </p>
      </div>
    );
  }

  const activeOwners = allUsers.filter((u) => u.role === 'OWNER' && u.is_active);

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim() || !newName.trim()) {
      alert('Email dan Nama Lengkap wajib diisi.');
      return;
    }

    const res = dataService.addUser({
      email: newEmail.trim(),
      fullName: newName.trim(),
      role: newRole,
    });

    alert(res.message);
    if (res.success) {
      setShowAddModal(false);
      setNewEmail('');
      setNewName('');
      setNewRole('STAFF');
      onRefresh();
    }
  };

  const handleRoleChange = (userId: string, targetRole: UserRole) => {
    const targetUser = allUsers.find((u) => u.id === userId);
    if (!targetUser) return;

    // Protection for last owner
    if (targetUser.role === 'OWNER' && targetRole !== 'OWNER' && activeOwners.length <= 1) {
      alert('Owner terakhir tidak boleh diturunkan perannya.');
      return;
    }

    const res = dataService.updateUserRole(userId, targetRole);
    alert(res.message);
    if (res.success) onRefresh();
  };

  const handleToggleStatus = (userId: string) => {
    const targetUser = allUsers.find((u) => u.id === userId);
    if (!targetUser) return;

    if (targetUser.role === 'OWNER' && targetUser.is_active && activeOwners.length <= 1) {
      alert('Owner terakhir tidak boleh dinonaktifkan.');
      return;
    }

    const res = dataService.toggleUserStatus(userId);
    alert(res.message);
    if (res.success) onRefresh();
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'OWNER':
        return 'bg-amber-100 text-amber-900 border-amber-300';
      case 'ADMIN':
        return 'bg-blue-100 text-blue-900 border-blue-300';
      case 'STAFF':
        return 'bg-emerald-100 text-emerald-900 border-emerald-300';
      case 'VIEWER':
        return 'bg-slate-100 text-slate-800 border-slate-300';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Manajemen Pengguna & Tingkatan Role
            </h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
              OWNER ONLY
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Atur hak akses tim: OWNER (Penuh), ADMIN (Semua kecuali user), STAFF (Drafting & submit), VIEWER (Read-only).
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold tracking-wide transition-colors shadow-xs"
        >
          <Plus className="w-4 h-4" />
          Undang / Tambah Pengguna
        </button>
      </div>

      {/* Role Guide Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        {[
          {
            role: 'OWNER',
            title: 'Owner',
            desc: 'Persetujuan terbit, revisi, pembatalan, pembayaran, pengaturan, dan manajemen pengguna.',
          },
          {
            role: 'ADMIN',
            title: 'Admin',
            desc: 'Persetujuan terbit, revisi, pembatalan, pencatatan pembayaran, dan pengaturan bank/logo.',
          },
          {
            role: 'STAFF',
            title: 'Staff',
            desc: 'Pembuatan & pengeditan draft, pengajuan untuk ditinjau, penarikan draft, duplikasi invoice.',
          },
          {
            role: 'VIEWER',
            title: 'Viewer',
            desc: 'Akses baca saja: melihat invoice terbit, riwayat, dan mengunduh PDF publik.',
          },
        ].map((r) => (
          <div key={r.role} className="bg-white p-4 rounded-xl border border-slate-200 text-xs">
            <span className={`inline-block px-2 py-0.5 rounded font-bold text-[10px] mb-2 ${getRoleBadge(r.role as UserRole)}`}>
              {r.role}
            </span>
            <h4 className="font-bold text-slate-900 mb-1">{r.title}</h4>
            <p className="text-slate-500 text-[11px] leading-relaxed">{r.desc}</p>
          </div>
        ))}
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <table className="w-full text-left text-xs text-slate-700">
          <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
            <tr>
              <th className="py-3.5 px-4">Nama Pengguna</th>
              <th className="py-3.5 px-4">Email</th>
              <th className="py-3.5 px-4">Role Akses</th>
              <th className="py-3.5 px-4">Status Akun</th>
              <th className="py-3.5 px-4 text-right">Tindakan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {allUsers.map((u) => {
              const isSelf = u.id === currentUser.id;
              const isOnlyOwner = u.role === 'OWNER' && activeOwners.length <= 1;

              return (
                <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3.5 px-4 font-bold text-slate-900">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-slate-700 font-bold text-xs">
                        {u.full_name.charAt(0)}
                      </div>
                      <div>
                        <span>{u.full_name}</span>
                        {isSelf && (
                          <span className="ml-1.5 text-[10px] text-slate-400 font-normal">
                            (Anda)
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  <td className="py-3.5 px-4 text-slate-600">{u.email}</td>

                  <td className="py-3.5 px-4">
                    <select
                      value={u.role}
                      disabled={isOnlyOwner}
                      onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole)}
                      className={`text-xs font-semibold p-1 px-2 rounded border focus:outline-none cursor-pointer ${getRoleBadge(
                        u.role
                      )}`}
                    >
                      <option value="OWNER">OWNER</option>
                      <option value="ADMIN">ADMIN</option>
                      <option value="STAFF">STAFF</option>
                      <option value="VIEWER">VIEWER</option>
                    </select>
                  </td>

                  <td className="py-3.5 px-4">
                    {u.is_active ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        Aktif
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-slate-400 font-semibold text-[11px]">
                        <UserX className="w-3.5 h-3.5" />
                        Nonaktif
                      </span>
                    )}
                  </td>

                  <td className="py-3.5 px-4 text-right">
                    {!isOnlyOwner ? (
                      <button
                        onClick={() => handleToggleStatus(u.id)}
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded border transition-colors ${
                          u.is_active
                            ? 'text-rose-600 border-rose-200 hover:bg-rose-50'
                            : 'text-emerald-700 border-emerald-200 hover:bg-emerald-50'
                        }`}
                      >
                        {u.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                      </button>
                    ) : (
                      <span className="text-[10px] text-slate-400 italic">Owner Terakhir</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
              Tambah Pengguna Baru
            </h3>
            <form onSubmit={handleAddUser} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nama Lengkap</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Sarah Anindita"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Alamat Email</label>
                <input
                  type="email"
                  required
                  placeholder="sarah@invoicedigital.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tingkatan Role</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserRole)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                >
                  <option value="STAFF">STAFF (Drafting & Submit)</option>
                  <option value="ADMIN">ADMIN (Penerbitan & Operasional)</option>
                  <option value="OWNER">OWNER (Penuh termasuk Manajemen User)</option>
                  <option value="VIEWER">VIEWER (Read Only)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold"
                >
                  Tambahkan Pengguna
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
