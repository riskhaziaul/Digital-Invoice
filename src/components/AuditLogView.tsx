import React, { useState, useMemo } from 'react';
import { History, Search, Shield, Clock, FileText } from 'lucide-react';
import { AuditLogEntry, UserProfile } from '../types';
import { formatTanggalIndonesia } from '../lib/terbilang';
import { dataService } from '../lib/data-service';

interface AuditLogViewProps {
  currentUser: UserProfile;
}

export const AuditLogView: React.FC<AuditLogViewProps> = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const logs = dataService.getAuditLogs();

  const filteredLogs = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return logs.filter((l) => {
      return (
        !q ||
        l.action.toLowerCase().includes(q) ||
        (l.user_name || l.user_email || '').toLowerCase().includes(q) ||
        l.user_role.toLowerCase().includes(q) ||
        (l.details && JSON.stringify(l.details).toLowerCase().includes(q))
      );
    });
  }, [logs, searchTerm]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Riwayat Aktivitas & Jejak Audit</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Seluruh aktivitas pembuatan, pengajuan, persetujuan, pembayaran, dan perubahan data tercatat secara permanen.
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white p-4 rounded-xl border border-slate-200">
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Cari aktivitas, nama pengguna, atau rincian..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
          />
        </div>
      </div>

      {/* Logs Table */}
      {logs.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
          <History className="w-10 h-10 mx-auto text-slate-300 mb-2" />
          <p className="text-xs">Belum ada catatan aktivitas.</p>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400 text-xs">
          Tidak ada log aktivitas yang cocok dengan pencarian Anda.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Waktu (WIB)</th>
                <th className="py-3 px-4">Pengguna</th>
                <th className="py-3 px-4">Aktivitas</th>
                <th className="py-3 px-4">Rincian Perubahan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.map((log) => {
                const dateObj = new Date(log.created_at);
                const timeStr = dateObj.toLocaleTimeString('id-ID', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                });

                return (
                  <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                      {formatTanggalIndonesia(log.created_at)} {timeStr}
                    </td>

                    <td className="py-3.5 px-4 font-medium text-slate-900">
                      <span>{log.user_name}</span>
                      <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                        {log.user_role}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 font-bold text-slate-800">
                      {log.action}
                    </td>

                    <td className="py-3.5 px-4 text-slate-600">
                      {log.details ? (
                        <div className="text-[11px] font-mono bg-slate-50 p-2 rounded border border-slate-200 overflow-x-auto max-w-md">
                          {JSON.stringify(log.details, null, 2)}
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
