import React, { useState } from 'react';
import {
  FileText,
  Users,
  Building2,
  CreditCard,
  MessageSquare,
  UserCheck,
  Settings,
  History,
  Menu,
  X,
  Shield,
  ExternalLink,
  HelpCircle,
} from 'lucide-react';
import { UserProfile, UserRole } from '../types';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentUser: UserProfile;
  allUsers: UserProfile[];
  onSwitchUser: (userId: string) => void;
  onOpenSetupGuide: () => void;
  isSupabaseConnected: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  currentUser,
  allUsers,
  onSwitchUser,
  onOpenSetupGuide,
  isSupabaseConnected,
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const canAccess = (tab: string): boolean => {
    if (currentUser.role === 'OWNER') return true;
    if (currentUser.role === 'ADMIN') {
      return tab !== 'pengguna'; // Only Owner can manage users
    }
    if (currentUser.role === 'STAFF') {
      return !['pengguna', 'pengaturan'].includes(tab);
    }
    if (currentUser.role === 'VIEWER') {
      return ['dashboard', 'invoice', 'pembayaran', 'riwayat'].includes(tab);
    }
    return false;
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: FileText },
    { id: 'invoice', label: 'Invoice', icon: FileText },
    { id: 'klien', label: 'Klien', icon: Building2 },
    { id: 'pembayaran', label: 'Pembayaran', icon: CreditCard },
    { id: 'template', label: 'Template Pesan', icon: MessageSquare },
    { id: 'pengguna', label: 'Pengguna', icon: UserCheck },
    { id: 'pengaturan', label: 'Pengaturan', icon: Settings },
    { id: 'riwayat', label: 'Riwayat Aktivitas', icon: History },
  ];

  const getRoleBadgeColor = (role: UserRole) => {
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
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo & Name */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab('dashboard')}>
            <div className="w-10 h-10 rounded-lg bg-slate-900 flex items-center justify-center text-white font-bold tracking-wider shadow-xs">
              ID
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 text-base tracking-tight">Invoice Digital</span>
                <span className="hidden sm:inline-block px-2 py-0.5 text-[11px] font-medium bg-slate-100 text-slate-600 rounded-md">
                  v2.0
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">Digital & Marcomm Team</p>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center space-x-1">
            {navItems
              .filter((item) => canAccess(item.id))
              .map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    id={`nav-tab-${item.id}`}
                    onClick={() => setActiveTab(item.id)}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold tracking-wide transition-colors flex items-center gap-1.5 ${
                      isActive
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </button>
                );
              })}
          </nav>

          {/* User & Role Switcher + Setup Help */}
          <div className="flex items-center gap-2">
            {/* Setup Guide Button */}
            <button
              onClick={onOpenSetupGuide}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              title="Panduan Setup Netlify & Supabase"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isSupabaseConnected ? 'bg-emerald-500' : 'bg-amber-400 animate-pulse'
                }`}
              />
              <span className="hidden md:inline">
                {isSupabaseConnected ? 'Supabase Terhubung' : 'Panduan Setup'}
              </span>
              <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {/* Active User / Role Switcher dropdown */}
            <div className="relative flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-1 px-2">
              <Shield className="w-3.5 h-3.5 text-slate-500" />
              <div className="flex flex-col text-left">
                <span className="text-[10px] text-slate-400 font-medium leading-tight">Role Aktif:</span>
                <select
                  value={currentUser.id}
                  onChange={(e) => onSwitchUser(e.target.value)}
                  className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer pr-1"
                >
                  {allUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.role}: {u.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${getRoleBadgeColor(
                  currentUser.role
                )}`}
              >
                {currentUser.role}
              </span>
            </div>

            {/* Mobile Menu Toggle Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 focus:outline-none"
            >
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {isMobileMenuOpen && (
        <div className="lg:hidden border-t border-slate-200 bg-white px-4 pt-2 pb-4 space-y-1">
          {navItems
            .filter((item) => canAccess(item.id))
            .map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium ${
                    isActive
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </button>
              );
            })}
        </div>
      )}
    </header>
  );
};
