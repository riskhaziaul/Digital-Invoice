import {
  AppSettings,
  AuditLog,
  BankAccount,
  BankSnapshot,
  Client,
  DocumentStatus,
  GeneralClause,
  Invoice,
  InvoiceAttachment,
  InvoiceItem,
  InvoiceVersion,
  MessageTemplate,
  PaymentRecord,
  PaymentStatus,
  UserProfile,
  UserRole,
  normalizePaymentStatus,
} from '../types';
import {
  INITIAL_APP_SETTINGS,
  INITIAL_BANK_ACCOUNTS,
  INITIAL_GENERAL_CLAUSES,
  INITIAL_MESSAGE_TEMPLATES,
} from './constants';
import {
  angkaKeTerbilang,
  bulanKeRomawi,
  formatTanggalIndonesia,
  getEffectiveExchangeRate,
  adjustPeriodToCurrentMonth,
  adjustItemDescriptionToCurrentMonth,
  formatBulanTahunBerjalan,
} from './terbilang';
import { generateSecureToken, hashToken } from './crypto-token';
import { generateInvoicePDF } from './pdf-generator';

const STORAGE_KEYS = {
  SETTINGS: 'invoice_digital_settings',
  USERS: 'invoice_digital_users',
  CLIENTS: 'invoice_digital_clients',
  INVOICES: 'invoice_digital_invoices',
  TEMPLATES: 'invoice_digital_templates',
  AUDIT_LOGS: 'invoice_digital_audit_logs',
  ACTIVE_USER_ID: 'invoice_digital_active_user_id',
  TOKENS: 'invoice_digital_tokens',
  AUTH_SESSION: 'invoice_digital_auth_session',
};

// Initial default owner & users (with username & password credentials)
const DEFAULT_USERS: UserProfile[] = [
  {
    id: 'usr-owner-1',
    username: 'admin',
    password: 'admin123',
    email: 'riskhaziaul@gmail.com',
    full_name: 'Riskha Ziaulhusna',
    role: 'OWNER',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'usr-staff-1',
    username: 'staff',
    password: 'staff123',
    email: 'staff@invoicedigital.com',
    full_name: 'Digital Staff',
    role: 'STAFF',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const DEFAULT_OWNER: UserProfile = DEFAULT_USERS[0];

class DataService {
  private settings: AppSettings = { ...INITIAL_APP_SETTINGS };
  private users: UserProfile[] = [...DEFAULT_USERS];
  private clients: Client[] = []; // Starts strictly EMPTY in production!
  private invoices: Invoice[] = []; // Starts strictly EMPTY in production!
  private templates: MessageTemplate[] = [...INITIAL_MESSAGE_TEMPLATES];
  private auditLogs: AuditLog[] = [];
  private activeUserId: string = DEFAULT_OWNER.id;
  private tokensMap: Record<string, { invoiceId: string; versionId: string; isActive: boolean }> = {};

  constructor() {
    this.loadFromStorage();
    this.syncWithServer();
  }

  public async syncWithServer() {
    if (typeof window === 'undefined') return;
    try {
      const resp = await fetch('/api/invoices/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoices: this.invoices,
          clients: this.clients,
          tokens: this.tokensMap,
          settings: this.settings,
          users: this.users,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        let changed = false;
        if (data.invoices && Array.isArray(data.invoices) && data.invoices.length > 0) {
          const localMap = new Map(this.invoices.map((i) => [i.id, i]));
          for (const sInv of data.invoices) {
            if (!localMap.has(sInv.id)) {
              this.invoices.push(sInv);
              changed = true;
            }
          }
          if (changed) {
            this.save(STORAGE_KEYS.INVOICES, this.invoices, false);
          }
        }
        if (data.tokens && typeof data.tokens === 'object') {
          this.tokensMap = { ...this.tokensMap, ...data.tokens };
          this.save(STORAGE_KEYS.TOKENS, this.tokensMap, false);
        }
      }
    } catch (err) {
      // Offline or dev server starting up
    }
  }

  private loadFromStorage() {
    try {
      if (typeof window === 'undefined') return;

      const savedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (savedSettings) {
        this.settings = { ...INITIAL_APP_SETTINGS, ...JSON.parse(savedSettings) };
        if (!Array.isArray(this.settings.bank_accounts)) {
          this.settings.bank_accounts = [...INITIAL_BANK_ACCOUNTS];
        }
        if (!Array.isArray(this.settings.general_clauses)) {
          this.settings.general_clauses = [...INITIAL_GENERAL_CLAUSES];
        }
      } else {
        this.settings = { ...INITIAL_APP_SETTINGS };
      }

      // Initialize general_clauses if not present
      if (!Array.isArray(this.settings.general_clauses)) {
        this.settings.general_clauses = [...INITIAL_GENERAL_CLAUSES];
      }

      const savedUsers = localStorage.getItem(STORAGE_KEYS.USERS);
      if (savedUsers) {
        const parsedUsers = JSON.parse(savedUsers);
        this.users = parsedUsers.map((u: UserProfile) => {
          if (!u.username) {
            u.username = u.role === 'OWNER' ? 'admin' : (u.email ? u.email.split('@')[0].toLowerCase() : 'staff');
          }
          if (!u.password) {
            u.password = u.role === 'OWNER' ? 'admin123' : 'staff123';
          }
          return u;
        });
      } else {
        this.users = [...DEFAULT_USERS];
      }

      const savedClients = localStorage.getItem(STORAGE_KEYS.CLIENTS);
      if (savedClients) this.clients = JSON.parse(savedClients);

      const savedInvoices = localStorage.getItem(STORAGE_KEYS.INVOICES);
      if (savedInvoices) {
        const parsedInv = JSON.parse(savedInvoices);
        this.invoices = parsedInv.map((inv: Invoice) => {
          if (inv?.current_version?.items) {
            const effectiveRate = getEffectiveExchangeRate(
              inv.current_version.items,
              inv.current_version.custom_exchange_rate || 16250
            );
            if (effectiveRate) {
              inv.current_version.custom_exchange_rate = effectiveRate;
            }
          }
          if (!inv.payments) {
            inv.payments = [];
          }

          // Sinkronisasi invoice berstatus 'Sudah di bayar' agar memiliki record pembayaran utuh
          const normStatus = normalizePaymentStatus(inv.payment_status, inv.status);
          const grandTotal = inv.current_version?.grand_total || 0;
          const currentPayments = inv.payments
            .filter((p) => !p.is_reversed)
            .reduce((s, p) => s + (p.amount || 0), 0);

          if (normStatus === 'Sudah di bayar' && currentPayments < grandTotal && grandTotal > 0) {
            inv.payments.push({
              id: 'pay-sync-' + inv.id,
              invoice_id: inv.id,
              amount: grandTotal - currentPayments,
              payment_date: inv.current_version?.due_date || inv.current_version?.issue_date || new Date().toISOString().slice(0, 10),
              payment_method: 'Transfer Bank blu by BCA Digital',
              reference_number: 'LUNAS',
              notes: 'Pelunasan invoice terkonfirmasi',
              recorded_by_id: 'system',
              recorded_by_name: 'Sistem Pembayaran',
              is_reversed: false,
              created_at: inv.updated_at || inv.created_at || new Date().toISOString(),
            });
          }
          return inv;
        });
      }

      const savedTemplates = localStorage.getItem(STORAGE_KEYS.TEMPLATES);
      if (savedTemplates) {
        const parsed = JSON.parse(savedTemplates);
        // Automatically migrate default templates to the latest PDF attachment text
        this.templates = parsed.map((t: MessageTemplate) => {
          if (t.is_default) {
            const defMatch = INITIAL_MESSAGE_TEMPLATES.find((d) => d.type === t.type);
            if (defMatch) {
              return { ...t, body: defMatch.body };
            }
          }
          return t;
        });
      }

      const savedLogs = localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS);
      if (savedLogs) this.auditLogs = JSON.parse(savedLogs);

      const savedActiveUser = localStorage.getItem(STORAGE_KEYS.ACTIVE_USER_ID);
      if (savedActiveUser && this.users.some((u) => u.id === savedActiveUser)) {
        this.activeUserId = savedActiveUser;
      }

      const savedTokens = localStorage.getItem(STORAGE_KEYS.TOKENS);
      if (savedTokens) this.tokensMap = JSON.parse(savedTokens);
    } catch (e) {
      console.error('Error loading stored data:', e);
    }
  }

  private save(key: string, data: any, triggerSync: boolean = true) {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(key, JSON.stringify(data));
      }
      if (triggerSync && [STORAGE_KEYS.INVOICES, STORAGE_KEYS.CLIENTS, STORAGE_KEYS.TOKENS].includes(key)) {
        setTimeout(() => this.syncWithServer(), 100);
      }
    } catch (e) {
      console.error('Error saving data:', e);
    }
  }

  // --- Authentication with Username & Password ---
  public login(usernameOrEmail: string, password: string): { success: boolean; message: string; user?: UserProfile } {
    const cleanUser = (usernameOrEmail || '').trim().toLowerCase();
    const cleanPass = (password || '').trim();

    if (!cleanUser || !cleanPass) {
      return { success: false, message: 'Username/Email dan Password wajib diisi.' };
    }

    const matched = this.users.find(
      (u) =>
        (u.username?.toLowerCase() === cleanUser || u.email?.toLowerCase() === cleanUser) &&
        (u.password ? u.password === cleanPass : (cleanPass === 'admin123' || cleanPass === 'staff123'))
    );

    if (!matched) {
      return { success: false, message: 'Username atau password tidak sesuai.' };
    }

    if (!matched.is_active) {
      return { success: false, message: 'Akun Anda telah dinonaktifkan. Hubungi Administrator/Owner.' };
    }

    this.activeUserId = matched.id;
    this.save(STORAGE_KEYS.ACTIVE_USER_ID, matched.id);
    this.save(STORAGE_KEYS.AUTH_SESSION, { userId: matched.id, loggedInAt: new Date().toISOString() }, false);
    this.recordAuditLog('USER', matched.id, `Pengguna ${matched.full_name} (${matched.username}) berhasil masuk.`);

    return { success: true, message: `Selamat datang kembali, ${matched.full_name}!`, user: matched };
  }

  public logout(): void {
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(STORAGE_KEYS.AUTH_SESSION);
      }
    } catch (e) {
      console.error(e);
    }
  }

  public isAuthenticated(): boolean {
    try {
      if (typeof window === 'undefined') return false;
      const session = localStorage.getItem(STORAGE_KEYS.AUTH_SESSION);
      if (!session) return false;
      const parsed = JSON.parse(session);
      return Boolean(parsed?.userId && this.users.some((u) => u.id === parsed.userId && u.is_active));
    } catch {
      return false;
    }
  }

  // --- Current User & Roles ---
  public getActiveUser(): UserProfile {
    const user = this.users.find((u) => u.id === this.activeUserId);
    if (!user || !user.is_active) {
      // Fallback to first active owner or first active user
      const firstOwner = this.users.find((u) => u.role === 'OWNER' && u.is_active);
      return firstOwner || this.users[0] || DEFAULT_OWNER;
    }
    return user;
  }

  public setActiveUser(userId: string) {
    const target = this.users.find((u) => u.id === userId);
    if (target && target.is_active) {
      this.activeUserId = userId;
      this.save(STORAGE_KEYS.ACTIVE_USER_ID, userId);
    }
  }

  public getAllUsers(): UserProfile[] {
    return [...this.users];
  }

  public inviteUser(
    email: string,
    fullName: string,
    role: UserRole,
    username?: string,
    password?: string
  ): { success: boolean; message: string; user?: UserProfile } {
    const active = this.getActiveUser();
    if (active.role !== 'OWNER') {
      return { success: false, message: 'Hanya OWNER yang dapat mengundang pengguna.' };
    }

    if (!email || !fullName) {
      return { success: false, message: 'Email dan Nama Lengkap wajib diisi.' };
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = (username || cleanEmail.split('@')[0]).trim().toLowerCase();

    if (this.users.some((u) => u.email.toLowerCase() === cleanEmail)) {
      return { success: false, message: 'Pengguna dengan email tersebut sudah terdaftar.' };
    }

    if (this.users.some((u) => u.username?.toLowerCase() === cleanUsername)) {
      return { success: false, message: 'Username sudah digunakan oleh akun lain.' };
    }

    const newUser: UserProfile = {
      id: 'usr-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      username: cleanUsername,
      password: password?.trim() || 'password123',
      email: cleanEmail,
      full_name: fullName.trim(),
      role,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.users.push(newUser);
    this.save(STORAGE_KEYS.USERS, this.users);

    this.recordAuditLog('USER', newUser.id, `Mengundang pengguna baru ${newUser.full_name} (${newUser.username}) dengan role ${newUser.role}`);
    return { success: true, message: `Pengguna ${newUser.full_name} berhasil ditambahkan. Username: ${newUser.username}`, user: newUser };
  }

  public updateUserRole(targetUserId: string, newRole: UserRole): { success: boolean; message: string } {
    const active = this.getActiveUser();
    if (active.role !== 'OWNER') {
      return { success: false, message: 'Hanya OWNER yang dapat mengubah role pengguna.' };
    }

    const target = this.users.find((u) => u.id === targetUserId);
    if (!target) return { success: false, message: 'Pengguna tidak ditemukan.' };

    // Prevent demoting last owner
    if (target.role === 'OWNER' && newRole !== 'OWNER') {
      const activeOwners = this.users.filter((u) => u.role === 'OWNER' && u.is_active);
      if (activeOwners.length <= 1) {
        return { success: false, message: 'Owner terakhir tidak boleh diturunkan rolenya.' };
      }
    }

    const oldRole = target.role;
    target.role = newRole;
    target.updated_at = new Date().toISOString();
    this.save(STORAGE_KEYS.USERS, this.users);

    this.recordAuditLog('USER', target.id, `Mengubah role ${target.full_name} dari ${oldRole} ke ${newRole}`);
    return { success: true, message: `Role berhasil diubah menjadi ${newRole}` };
  }

  public toggleUserActiveStatus(targetUserId: string): { success: boolean; message: string } {
    const active = this.getActiveUser();
    if (active.role !== 'OWNER') {
      return { success: false, message: 'Hanya OWNER yang dapat mengaktifkan atau menonaktifkan pengguna.' };
    }

    const target = this.users.find((u) => u.id === targetUserId);
    if (!target) return { success: false, message: 'Pengguna tidak ditemukan.' };

    // Prevent deactivating last owner
    if (target.role === 'OWNER' && target.is_active) {
      const activeOwners = this.users.filter((u) => u.role === 'OWNER' && u.is_active);
      if (activeOwners.length <= 1) {
        return { success: false, message: 'Owner terakhir tidak boleh dinonaktifkan.' };
      }
    }

    target.is_active = !target.is_active;
    target.updated_at = new Date().toISOString();
    this.save(STORAGE_KEYS.USERS, this.users);

    const action = target.is_active ? 'mengaktifkan' : 'menonaktifkan';
    this.recordAuditLog('USER', target.id, `${action} akun ${target.full_name} (${target.email})`);
    return { success: true, message: `Akun berhasil di-${action}` };
  }

  public updateUserCredentials(
    targetUserId: string,
    newUsername?: string,
    newPassword?: string
  ): { success: boolean; message: string } {
    const target = this.users.find((u) => u.id === targetUserId);
    if (!target) return { success: false, message: 'Pengguna tidak ditemukan.' };

    if (newUsername && newUsername.trim()) {
      const cleanU = newUsername.trim().toLowerCase();
      const duplicate = this.users.find((u) => u.id !== targetUserId && u.username?.toLowerCase() === cleanU);
      if (duplicate) {
        return { success: false, message: `Username "${newUsername}" sudah digunakan oleh pengguna lain.` };
      }
      target.username = cleanU;
    }

    if (newPassword && newPassword.trim()) {
      target.password = newPassword.trim();
    }

    target.updated_at = new Date().toISOString();
    this.save(STORAGE_KEYS.USERS, this.users);
    this.recordAuditLog('USER', target.id, `Memperbarui username/password pengguna: ${target.full_name}`);
    return { success: true, message: `Kredensial login ${target.full_name} berhasil diperbarui.` };
  }

  // --- Settings (Owner Only for Bank & Sequence) ---
  public getSettings(): AppSettings {
    return { ...this.settings };
  }

  public updateSettings(newSettings: Partial<AppSettings>): { success: boolean; message: string } {
    const active = this.getActiveUser();

    // Restricted fields (bank account, initial sequence) require OWNER
    const restrictedChanged =
      newSettings.bank_name !== undefined ||
      newSettings.bank_account_no !== undefined ||
      newSettings.bank_account_name !== undefined ||
      newSettings.initial_sequence !== undefined;

    if (restrictedChanged && active.role !== 'OWNER') {
      return { success: false, message: 'Hanya OWNER yang berwenang mengubah rekening bank atau urutan nomor invoice.' };
    }

    if (active.role !== 'OWNER' && active.role !== 'ADMIN') {
      return { success: false, message: 'Anda tidak memiliki hak akses mengubah pengaturan.' };
    }

    // Keep bank account number as string to preserve leading zeros!
    const sanitizedAccountNo = newSettings.bank_account_no !== undefined
      ? String(newSettings.bank_account_no).trim()
      : this.settings.bank_account_no;

    this.settings = {
      ...this.settings,
      ...newSettings,
      bank_account_no: sanitizedAccountNo,
      updated_at: new Date().toISOString(),
    };

    this.save(STORAGE_KEYS.SETTINGS, this.settings);
    this.recordAuditLog('SETTINGS', 'app_settings', 'Memperbarui pengaturan identitas penerbit dan rekening aplikasi');
    return { success: true, message: 'Pengaturan berhasil diperbarui.' };
  }

  // Logo upload with versioning
  public updateLogo(dataUrl: string): { success: boolean; message: string } {
    const active = this.getActiveUser();
    if (active.role !== 'OWNER' && active.role !== 'ADMIN') {
      return { success: false, message: 'Hanya OWNER atau ADMIN yang dapat mengunggah logo.' };
    }

    this.settings.logo_url = dataUrl;
    this.settings.logo_version = (this.settings.logo_version || 1) + 1;
    this.settings.updated_at = new Date().toISOString();
    this.save(STORAGE_KEYS.SETTINGS, this.settings);

    this.recordAuditLog('SETTINGS', 'logo', `Memperbarui logo aplikasi (versi ${this.settings.logo_version})`);
    return { success: true, message: 'Logo berhasil diperbarui.' };
  }

  public removeLogo(): { success: boolean; message: string } {
    const active = this.getActiveUser();
    if (active.role !== 'OWNER' && active.role !== 'ADMIN') {
      return { success: false, message: 'Hanya OWNER atau ADMIN yang dapat menghapus logo.' };
    }

    this.settings.logo_url = undefined;
    this.settings.logo_version = (this.settings.logo_version || 1) + 1;
    this.settings.updated_at = new Date().toISOString();
    this.save(STORAGE_KEYS.SETTINGS, this.settings);

    this.recordAuditLog('SETTINGS', 'logo', 'Menghapus logo aplikasi');
    return { success: true, message: 'Logo berhasil dihapus.' };
  }

  // --- Bank Accounts Management ---
  public getBankAccounts(): BankAccount[] {
    if (!this.settings.bank_accounts) {
      this.settings.bank_accounts = [
        {
          id: 'bank-1',
          bank_name: this.settings.bank_name || 'blu by BCA Digital',
          account_number: this.settings.bank_account_no || '000480500229',
          account_name: this.settings.bank_account_name || 'Riskha Ziaulhusna',
          is_default: true,
        },
      ];
    }
    return [...this.settings.bank_accounts];
  }

  public saveBankAccount(accountData: Omit<BankAccount, 'id'> & { id?: string }): {
    success: boolean;
    message: string;
    account?: BankAccount;
  } {
    const active = this.getActiveUser();
    if (active.role === 'VIEWER') {
      return { success: false, message: 'Viewer tidak memiliki izin mengubah data rekening.' };
    }

    if (!accountData.bank_name?.trim() || !accountData.account_number?.trim() || !accountData.account_name?.trim()) {
      return { success: false, message: 'Nama Bank, Nomor Rekening, dan Atas Nama wajib diisi.' };
    }

    const accounts = this.getBankAccounts();
    const cleanAccountNo = String(accountData.account_number).trim();

    if (accountData.id) {
      const idx = accounts.findIndex((a) => a.id === accountData.id);
      if (idx === -1) return { success: false, message: 'Rekening bank tidak ditemukan.' };

      const updated: BankAccount = {
        ...accounts[idx],
        bank_name: accountData.bank_name.trim(),
        account_number: cleanAccountNo,
        account_name: accountData.account_name.trim(),
        is_default: accountData.is_default !== undefined ? accountData.is_default : accounts[idx].is_default,
      };

      if (updated.is_default) {
        accounts.forEach((a) => {
          if (a.id !== updated.id) a.is_default = false;
        });
        this.settings.bank_name = updated.bank_name;
        this.settings.bank_account_no = updated.account_number;
        this.settings.bank_account_name = updated.account_name;
      }

      accounts[idx] = updated;
      this.settings.bank_accounts = accounts;
      this.settings.updated_at = new Date().toISOString();
      this.save(STORAGE_KEYS.SETTINGS, this.settings);
      this.recordAuditLog('SETTINGS', updated.id, `Memperbarui rekening bank: ${updated.bank_name} (${updated.account_number})`);
      return { success: true, message: 'Data rekening bank berhasil diperbarui.', account: updated };
    } else {
      const newAccount: BankAccount = {
        id: 'bank-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        bank_name: accountData.bank_name.trim(),
        account_number: cleanAccountNo,
        account_name: accountData.account_name.trim(),
        is_default: Boolean(accountData.is_default || accounts.length === 0),
      };

      if (newAccount.is_default) {
        accounts.forEach((a) => (a.is_default = false));
        this.settings.bank_name = newAccount.bank_name;
        this.settings.bank_account_no = newAccount.account_number;
        this.settings.bank_account_name = newAccount.account_name;
      }

      accounts.push(newAccount);
      this.settings.bank_accounts = accounts;
      this.settings.updated_at = new Date().toISOString();
      this.save(STORAGE_KEYS.SETTINGS, this.settings);
      this.recordAuditLog('SETTINGS', newAccount.id, `Menambahkan rekening bank baru: ${newAccount.bank_name} (${newAccount.account_number})`);
      return { success: true, message: 'Rekening bank baru berhasil ditambahkan.', account: newAccount };
    }
  }

  public deleteBankAccount(id: string): { success: boolean; message: string } {
    const accounts = this.getBankAccounts();
    const target = accounts.find((a) => a.id === id);
    if (!target) {
      return { success: false, message: 'Rekening bank tidak ditemukan.' };
    }

    const filtered = accounts.filter((a) => a.id !== id);
    if (filtered.length > 0) {
      if (!filtered.some((a) => a.is_default)) {
        filtered[0].is_default = true;
      }
      const def = filtered.find((a) => a.is_default) || filtered[0];
      this.settings.bank_name = def.bank_name;
      this.settings.bank_account_no = def.account_number;
      this.settings.bank_account_name = def.account_name;
    } else {
      this.settings.bank_name = '';
      this.settings.bank_account_no = '';
      this.settings.bank_account_name = '';
    }

    this.settings.bank_accounts = filtered;
    this.settings.updated_at = new Date().toISOString();
    this.save(STORAGE_KEYS.SETTINGS, this.settings);
    this.recordAuditLog('SETTINGS', id, `Menghapus rekening bank: ${target.bank_name} (${target.account_number})`);
    return { success: true, message: `Rekening ${target.bank_name} (${target.account_number}) berhasil dihapus.` };
  }

  public setDefaultBankAccount(id: string): { success: boolean; message: string } {
    const accounts = this.getBankAccounts();
    const target = accounts.find((a) => a.id === id);
    if (!target) return { success: false, message: 'Rekening tidak ditemukan.' };

    accounts.forEach((a) => (a.is_default = a.id === id));
    this.settings.bank_accounts = accounts;
    this.settings.bank_name = target.bank_name;
    this.settings.bank_account_no = target.account_number;
    this.settings.bank_account_name = target.account_name;
    this.settings.updated_at = new Date().toISOString();
    this.save(STORAGE_KEYS.SETTINGS, this.settings);
    this.recordAuditLog('SETTINGS', id, `Mengatur ${target.bank_name} sebagai rekening utama default`);
    return { success: true, message: `${target.bank_name} diatur sebagai rekening utama.` };
  }

  // --- General Clauses Management ---
  public getGeneralClauses(): GeneralClause[] {
    if (!Array.isArray(this.settings.general_clauses)) {
      this.settings.general_clauses = [...INITIAL_GENERAL_CLAUSES];
    }
    return [...this.settings.general_clauses];
  }

  public saveGeneralClause(clauseData: Omit<GeneralClause, 'id'> & { id?: string }): {
    success: boolean;
    message: string;
    clause?: GeneralClause;
  } {
    const active = this.getActiveUser();
    if (active.role === 'VIEWER') {
      return { success: false, message: 'Viewer tidak memiliki izin mengubah klausul.' };
    }

    if (!clauseData.content?.trim()) {
      return { success: false, message: 'Isi klausul wajib diisi.' };
    }

    const clauses = this.getGeneralClauses();
    if (clauseData.id) {
      const idx = clauses.findIndex((c) => c.id === clauseData.id);
      if (idx === -1) return { success: false, message: 'Klausul tidak ditemukan.' };

      const updated: GeneralClause = {
        ...clauses[idx],
        title: clauseData.title?.trim() || 'Klausul Tambahan',
        content: clauseData.content.trim(),
        is_active: clauseData.is_active !== undefined ? clauseData.is_active : clauses[idx].is_active,
      };

      clauses[idx] = updated;
      this.settings.general_clauses = clauses;
      this.settings.updated_at = new Date().toISOString();
      this.save(STORAGE_KEYS.SETTINGS, this.settings);
      this.recordAuditLog('SETTINGS', updated.id, `Memperbarui klausul umum: ${updated.title}`);
      return { success: true, message: 'Klausul berhasil diperbarui.', clause: updated };
    } else {
      const newClause: GeneralClause = {
        id: 'clause-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        title: clauseData.title?.trim() || `Klausul ${clauses.length + 1}`,
        content: clauseData.content.trim(),
        is_active: clauseData.is_active !== undefined ? clauseData.is_active : true,
      };

      clauses.push(newClause);
      this.settings.general_clauses = clauses;
      this.settings.updated_at = new Date().toISOString();
      this.save(STORAGE_KEYS.SETTINGS, this.settings);
      this.recordAuditLog('SETTINGS', newClause.id, `Menambahkan klausul umum baru: ${newClause.title}`);
      return { success: true, message: 'Klausul baru berhasil ditambahkan.', clause: newClause };
    }
  }

  public deleteGeneralClause(id: string): { success: boolean; message: string } {
    const active = this.getActiveUser();
    if (active.role === 'VIEWER') {
      return { success: false, message: 'Viewer tidak memiliki izin menghapus klausul.' };
    }

    const clauses = this.getGeneralClauses();
    const target = clauses.find((c) => c.id === id);
    this.settings.general_clauses = clauses.filter((c) => c.id !== id);
    this.settings.updated_at = new Date().toISOString();
    this.save(STORAGE_KEYS.SETTINGS, this.settings);
    this.recordAuditLog('SETTINGS', id, `Menghapus klausul umum: ${target?.title || id}`);
    return { success: true, message: `Klausul "${target?.title || 'tersebut'}" berhasil dihapus.` };
  }

  public toggleGeneralClause(id: string): { success: boolean; message: string; clause?: GeneralClause } {
    const active = this.getActiveUser();
    if (active.role === 'VIEWER') {
      return { success: false, message: 'Viewer tidak memiliki izin mengubah status klausul.' };
    }

    const clauses = this.getGeneralClauses();
    const target = clauses.find((c) => c.id === id);
    if (!target) return { success: false, message: 'Klausul tidak ditemukan.' };

    target.is_active = !target.is_active;
    this.settings.general_clauses = clauses;
    this.settings.updated_at = new Date().toISOString();
    this.save(STORAGE_KEYS.SETTINGS, this.settings);
    this.recordAuditLog('SETTINGS', id, `Mengubah status klausul umum ${target.title}: ${target.is_active ? 'Aktif' : 'Nonaktif'}`);
    return { success: true, message: `Status klausul diubah menjadi ${target.is_active ? 'Aktif' : 'Nonaktif'}.`, clause: target };
  }

  // --- Clients Management ---
  public getClients(): Client[] {
    const active = this.getActiveUser();
    if (active.role === 'OWNER' || active.role === 'ADMIN') {
      return [...this.clients];
    }
    // Staff & Viewer: only assigned clients
    return this.clients.filter((c) => c.assigned_user_ids.includes(active.id) || c.created_by === active.id);
  }

  public getClientById(id: string): Client | undefined {
    return this.clients.find((c) => c.id === id);
  }

  public saveClient(clientData: Omit<Client, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by'> & { id?: string }): {
    success: boolean;
    message: string;
    client?: Client;
  } {
    const active = this.getActiveUser();
    if (active.role === 'VIEWER') {
      return { success: false, message: 'Viewer tidak memiliki izin mengubah data klien.' };
    }

    // Validation
    if (!clientData.pic_name || !clientData.company_name) {
      return { success: false, message: 'Nama PIC dan Nama Perusahaan wajib diisi.' };
    }
    if (clientData.sapaan !== 'Tn.' && clientData.sapaan !== 'Ny.') {
      return { success: false, message: 'Sapaan hanya boleh Tn. atau Ny.' };
    }

    const now = new Date().toISOString();

    if (clientData.id) {
      // Edit
      const index = this.clients.findIndex((c) => c.id === clientData.id);
      if (index === -1) return { success: false, message: 'Klien tidak ditemukan.' };

      const existing = this.clients[index];
      // Check staff permission
      if (active.role === 'STAFF' && !existing.assigned_user_ids.includes(active.id) && existing.created_by !== active.id) {
        return { success: false, message: 'Anda tidak memiliki akses ke klien ini.' };
      }

      const updated: Client = {
        ...existing,
        ...clientData,
        id: existing.id,
        updated_by: active.full_name,
        updated_at: now,
      };

      this.clients[index] = updated;
      this.save(STORAGE_KEYS.CLIENTS, this.clients);
      this.recordAuditLog('CLIENT', updated.id, `Memperbarui data klien: ${updated.company_name} (${updated.sapaan} ${updated.pic_name})`);
      return { success: true, message: 'Data klien berhasil diperbarui.', client: updated };
    } else {
      // Create
      const newClient: Client = {
        ...clientData,
        id: 'cli-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        assigned_user_ids: clientData.assigned_user_ids || [active.id],
        created_by: active.full_name,
        updated_by: active.full_name,
        created_at: now,
        updated_at: now,
      };

      this.clients.push(newClient);
      this.save(STORAGE_KEYS.CLIENTS, this.clients);
      this.recordAuditLog('CLIENT', newClient.id, `Menambahkan klien baru: ${newClient.company_name} (${newClient.sapaan} ${newClient.pic_name})`);
      return { success: true, message: 'Klien baru berhasil ditambahkan.', client: newClient };
    }
  }

  // --- Invoices Management ---
  public getInvoices(): Invoice[] {
    const active = this.getActiveUser();
    if (active.role === 'OWNER' || active.role === 'ADMIN') {
      return [...this.invoices];
    }
    // Staff & Viewer: only assigned or created invoices
    return this.invoices.filter(
      (inv) => inv.created_by_id === active.id || inv.assigned_user_id === active.id
    );
  }

  public getInvoiceById(id: string): Invoice | undefined {
    return this.invoices.find((i) => i.id === id);
  }

  // Atomic invoice number generation
  // Format: INV/DIGITAL/{BULAN_ROMAWI}/{TAHUN_2_DIGIT}-{URUTAN_4_DIGIT}
  public generateNextInvoiceNumber(issueDateStr?: string): { invoiceNumber: string; sequenceNumber: number } {
    const issueDate = issueDateStr && !isNaN(new Date(issueDateStr).getTime()) ? new Date(issueDateStr) : new Date();
    const month = issueDate.getMonth() + 1; // 1 to 12
    const romanMonth = bulanKeRomawi(month);
    const year2Digit = String(issueDate.getFullYear()).slice(-2);

    // Sequence runs continuously and is not automatically reset
    let nextSeq = (this.settings.current_sequence || 0) + 1;
    if (nextSeq < this.settings.initial_sequence) {
      nextSeq = this.settings.initial_sequence;
    }

    // Ensure it does not collide with existing issued invoices
    while (this.invoices.some((inv) => inv.sequence_number === nextSeq)) {
      nextSeq++;
    }

    // Atomically increment current sequence
    this.settings.current_sequence = nextSeq;
    this.settings.updated_at = new Date().toISOString();
    this.save(STORAGE_KEYS.SETTINGS, this.settings);

    const seqFormatted = String(nextSeq).padStart(4, '0');
    const invoiceNumber = `INV/DIGITAL/${romanMonth}/${year2Digit}-${seqFormatted}`;

    return { invoiceNumber, sequenceNumber: nextSeq };
  }

  // Create or Update Draft
  public saveInvoiceDraft(draftData: {
    id?: string;
    clientId?: string;
    clientSnapshot: InvoiceVersion['client_snapshot'];
    issueDate: string;
    dueDate: string;
    period: string;
    items: InvoiceItem[];
    currency?: 'IDR' | 'USD';
    customExchangeRate?: number;
    discountType: 'percent' | 'nominal';
    discountValue: number;
    taxEnabled: boolean;
    taxRate: number;
    clientNotes?: string;
    workTerms?: string;
    paymentTerms?: string;
    assignedUserId?: string;
    attachments?: InvoiceAttachment[];
    bankSnapshot?: BankSnapshot;
    bankAccountsSnapshot?: BankAccount[];
    generalClauses?: GeneralClause[];
  }): { success: boolean; message: string; invoice?: Invoice } {
    const active = this.getActiveUser();
    if (active.role === 'VIEWER') {
      return { success: false, message: 'Viewer tidak memiliki izin membuat atau mengedit draft.' };
    }

    const now = new Date().toISOString();

    // Calculations
    const subtotal = draftData.items.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
    let discountAmount = 0;
    if (draftData.discountValue > 0) {
      if (draftData.discountType === 'percent') {
        discountAmount = Math.round(subtotal * (Math.min(100, Math.max(0, draftData.discountValue)) / 100));
      } else {
        discountAmount = Math.min(subtotal, Math.max(0, draftData.discountValue));
      }
    }
    const taxableBase = Math.max(0, subtotal - discountAmount);
    const taxAmount = draftData.taxEnabled ? Math.round(taxableBase * (Math.max(0, draftData.taxRate) / 100)) : 0;
    const grandTotal = taxableBase + taxAmount;
    const terbilang = angkaKeTerbilang(grandTotal);

    if (draftData.id) {
      // Update existing draft
      const index = this.invoices.findIndex((inv) => inv.id === draftData.id);
      if (index === -1) return { success: false, message: 'Invoice tidak ditemukan.' };

      const existing = this.invoices[index];
      if (existing.status !== 'Draft' && existing.status !== 'Dikembalikan') {
        return { success: false, message: `Invoice dengan status ${existing.status} tidak dapat diedit sebagai draft biasa.` };
      }

      // Check staff permission
      if (active.role === 'STAFF' && existing.created_by_id !== active.id && existing.assigned_user_id !== active.id) {
        return { success: false, message: 'Anda tidak memiliki akses ke draft ini.' };
      }

      const attachments = draftData.attachments !== undefined
        ? draftData.attachments
        : (existing.current_version.attachments || []);

      const effectiveExchangeRate = getEffectiveExchangeRate(
        draftData.items,
        draftData.customExchangeRate || (existing ? existing.current_version.custom_exchange_rate : undefined) || this.settings.default_usd_rate || 16250
      );

      const bankSnapshot = draftData.bankSnapshot || existing.current_version.bank_snapshot || {
        bank_name: this.settings.bank_name,
        account_number: this.settings.bank_account_no,
        account_name: this.settings.bank_account_name,
      };

      const bankAccountsSnapshot = draftData.bankAccountsSnapshot || existing.current_version.bank_accounts_snapshot || this.getBankAccounts();
      const generalClauses = draftData.generalClauses || existing.current_version.general_clauses || this.getGeneralClauses();

      const updatedVersion: InvoiceVersion = {
        ...existing.current_version,
        issue_date: draftData.issueDate,
        due_date: draftData.dueDate,
        period: draftData.period,
        client_snapshot: draftData.clientSnapshot,
        bank_snapshot: bankSnapshot,
        bank_accounts_snapshot: bankAccountsSnapshot,
        general_clauses: generalClauses,
        items: draftData.items,
        currency: draftData.currency || existing.current_version.currency || 'IDR',
        custom_exchange_rate: effectiveExchangeRate,
        subtotal,
        subtotal_usd: draftData.items.reduce((s, it) => s + (it.currency === 'USD' ? (Number(it.total_usd) || 0) : 0), 0),
        discount_type: draftData.discountType,
        discount_value: draftData.discountValue,
        discount_amount: discountAmount,
        tax_enabled: draftData.taxEnabled,
        tax_rate: draftData.taxRate,
        tax_amount: taxAmount,
        grand_total: grandTotal,
        grand_total_usd: draftData.items.reduce((s, it) => s + (it.currency === 'USD' ? (Number(it.total_usd) || 0) : 0), 0),
        terbilang,
        client_notes: draftData.clientNotes,
        work_terms: draftData.workTerms,
        payment_terms: draftData.paymentTerms,
        attachments,
        created_by_name: existing.created_by_name || active.full_name,
      };

      const updatedInvoice: Invoice = {
        ...existing,
        client_id: draftData.clientId,
        assigned_user_id: draftData.assignedUserId || existing.assigned_user_id,
        current_version: updatedVersion,
        attachments,
        status: 'Draft', // Any edit resets Dikembalikan to Draft
        updated_at: now,
      };

      this.invoices[index] = updatedInvoice;
      this.save(STORAGE_KEYS.INVOICES, this.invoices);
      this.recordAuditLog('INVOICE', updatedInvoice.id, `Memperbarui draft invoice untuk ${draftData.clientSnapshot.company_name || draftData.clientSnapshot.pic_name || 'klien'}`);
      return { success: true, message: 'Draft berhasil disimpan.', invoice: updatedInvoice };
    } else {
      // Create new draft
      const newInvoiceId = 'inv-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const newVersionId = 'ver-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

      const attachments = draftData.attachments || [];

      const bankSnapshot = draftData.bankSnapshot || {
        bank_name: this.settings.bank_name,
        account_number: this.settings.bank_account_no,
        account_name: this.settings.bank_account_name,
      };

      const bankAccountsSnapshot = draftData.bankAccountsSnapshot || this.getBankAccounts();
      const generalClauses = draftData.generalClauses || this.getGeneralClauses();

      const newVersion: InvoiceVersion = {
        id: newVersionId,
        invoice_id: newInvoiceId,
        version_number: 1,
        issue_date: draftData.issueDate,
        due_date: draftData.dueDate,
        period: draftData.period,
        client_snapshot: draftData.clientSnapshot,
        publisher_snapshot: {
          name: this.settings.publisher_name,
          sub_name: this.settings.publisher_sub_name,
          city: this.settings.publisher_city,
          country: this.settings.publisher_country,
          phone: this.settings.publisher_phone,
          email: this.settings.publisher_email,
          logo_url: this.settings.logo_url,
        },
        bank_snapshot: bankSnapshot,
        bank_accounts_snapshot: bankAccountsSnapshot,
        general_clauses: generalClauses,
        logo_snapshot_url: this.settings.logo_url,
        items: draftData.items,
        currency: draftData.currency || this.settings.default_currency || 'IDR',
        custom_exchange_rate: getEffectiveExchangeRate(draftData.items, draftData.customExchangeRate || this.settings.default_usd_rate || 16250),
        subtotal,
        subtotal_usd: draftData.items.reduce((s, it) => s + (it.currency === 'USD' ? (Number(it.total_usd) || 0) : 0), 0),
        discount_type: draftData.discountType,
        discount_value: draftData.discountValue,
        discount_amount: discountAmount,
        tax_enabled: draftData.taxEnabled,
        tax_rate: draftData.taxRate,
        tax_amount: taxAmount,
        grand_total: grandTotal,
        grand_total_usd: draftData.items.reduce((s, it) => s + (it.currency === 'USD' ? (Number(it.total_usd) || 0) : 0), 0),
        terbilang,
        client_notes: draftData.clientNotes || this.settings.default_client_notes,
        work_terms: draftData.workTerms || this.settings.default_work_terms,
        payment_terms: draftData.paymentTerms || this.settings.default_payment_terms,
        attachments,
        created_by_name: active.full_name,
        created_at: now,
      };

      const newInvoice: Invoice = {
        id: newInvoiceId,
        revision_number: 1,
        status: 'Draft',
        payment_status: 'Belum Bayar',
        client_id: draftData.clientId,
        assigned_user_id: draftData.assignedUserId || active.id,
        current_version: newVersion,
        attachments,
        payments: [],
        created_by_id: active.id,
        created_by_name: active.full_name,
        created_at: now,
        updated_at: now,
      };

      this.invoices.push(newInvoice);
      this.save(STORAGE_KEYS.INVOICES, this.invoices);
      this.recordAuditLog('INVOICE', newInvoice.id, `Membuat draft invoice baru untuk ${draftData.clientSnapshot.company_name || draftData.clientSnapshot.pic_name || 'klien'}`);
      return { success: true, message: 'Draft invoice berhasil dibuat.', invoice: newInvoice };
    }
  }

  // Submit Draft for Approval (Staff/Admin)
  public submitDraftForApproval(invoiceId: string, notes?: string): { success: boolean; message: string } {
    const active = this.getActiveUser();
    const invoice = this.getInvoiceById(invoiceId);
    if (!invoice) return { success: false, message: 'Invoice tidak ditemukan.' };

    if (invoice.status !== 'Draft' && invoice.status !== 'Dikembalikan') {
      return { success: false, message: `Hanya status Draft atau Dikembalikan yang dapat diajukan.` };
    }

    if (active.role === 'STAFF' && invoice.created_by_id !== active.id && invoice.assigned_user_id !== active.id) {
      return { success: false, message: 'Anda tidak berwenang mengajukan invoice ini.' };
    }

    // Minimum validation before submission
    const v = invoice.current_version;
    if (!v.client_snapshot.pic_name || !v.client_snapshot.company_name) {
      return { success: false, message: 'Penerima dan Perusahaan wajib diisi sebelum mengajukan.' };
    }
    if (!v.issue_date || !v.due_date || !v.period) {
      return { success: false, message: 'Tanggal terbit, jatuh tempo, dan periode wajib diisi.' };
    }
    if (!v.items || v.items.length === 0) {
      return { success: false, message: 'Minimal harus ada 1 item pekerjaan.' };
    }

    invoice.status = 'Diajukan';
    invoice.submission_notes = notes || '';
    invoice.updated_at = new Date().toISOString();
    this.save(STORAGE_KEYS.INVOICES, this.invoices);

    this.recordAuditLog('INVOICE', invoice.id, `Mengajukan invoice untuk persetujuan Owner/Admin${notes ? ': ' + notes : ''}`);
    return { success: true, message: 'Invoice berhasil diajukan untuk ditinjau.' };
  }

  // Withdraw Submission back to Draft (Staff)
  public withdrawSubmission(invoiceId: string): { success: boolean; message: string } {
    const active = this.getActiveUser();
    const invoice = this.getInvoiceById(invoiceId);
    if (!invoice) return { success: false, message: 'Invoice tidak ditemukan.' };

    if (invoice.status !== 'Diajukan') {
      return { success: false, message: 'Hanya invoice berstatus Diajukan yang dapat ditarik.' };
    }

    invoice.status = 'Draft';
    invoice.updated_at = new Date().toISOString();
    this.save(STORAGE_KEYS.INVOICES, this.invoices);

    this.recordAuditLog('INVOICE', invoice.id, `Menarik pengajuan kembali ke status Draft`);
    return { success: true, message: 'Pengajuan ditarik kembali ke status Draft.' };
  }

  // Return Submission (Owner/Admin)
  public returnSubmission(invoiceId: string, returnNotes: string): { success: boolean; message: string } {
    const active = this.getActiveUser();
    if (active.role !== 'OWNER' && active.role !== 'ADMIN') {
      return { success: false, message: 'Hanya Owner atau Admin yang dapat mengembalikan pengajuan.' };
    }

    const invoice = this.getInvoiceById(invoiceId);
    if (!invoice) return { success: false, message: 'Invoice tidak ditemukan.' };

    if (invoice.status !== 'Diajukan') {
      return { success: false, message: 'Hanya invoice berstatus Diajukan yang dapat dikembalikan.' };
    }

    if (!returnNotes?.trim()) {
      return { success: false, message: 'Catatan pengembalian wajib diisi.' };
    }

    invoice.status = 'Dikembalikan';
    invoice.return_notes = returnNotes.trim();
    invoice.updated_at = new Date().toISOString();
    this.save(STORAGE_KEYS.INVOICES, this.invoices);

    this.recordAuditLog('INVOICE', invoice.id, `Mengembalikan pengajuan invoice dengan catatan: ${returnNotes.trim()}`);
    return { success: true, message: 'Invoice dikembalikan kepada pembuat untuk direvisi.' };
  }

  // Publish Invoice (Owner/Admin only)
  public async publishInvoice(invoiceId: string): Promise<{ success: boolean; message: string; invoice?: Invoice }> {
    const active = this.getActiveUser();
    if (active.role !== 'OWNER' && active.role !== 'ADMIN') {
      return { success: false, message: 'Hanya Owner atau Admin yang berwenang menerbitkan invoice.' };
    }

    const invoice = this.getInvoiceById(invoiceId);
    if (!invoice) return { success: false, message: 'Invoice tidak ditemukan.' };

    if (invoice.status === 'Terbit') {
      return { success: false, message: 'Invoice ini sudah dalam status Terbit.' };
    }

    const v = invoice.current_version;

    // Validation before publishing: PIC or Company name required
    const hasPic = Boolean(v.client_snapshot.pic_name?.trim());
    const hasCompany = Boolean(v.client_snapshot.company_name?.trim());
    if (!hasPic && !hasCompany) {
      return { success: false, message: 'Nama penerima (PIC) atau nama perusahaan klien wajib diisi.' };
    }
    if (!hasPic) {
      v.client_snapshot.pic_name = v.client_snapshot.company_name.trim();
    }
    if (!hasCompany) {
      v.client_snapshot.company_name = v.client_snapshot.pic_name.trim();
    }

    if (!v.issue_date || !v.due_date) {
      return { success: false, message: 'Tanggal terbit dan tanggal jatuh tempo wajib diisi.' };
    }
    if (!v.period?.trim()) {
      v.period = formatTanggalIndonesia(v.issue_date);
    }
    if (new Date(v.due_date) < new Date(v.issue_date)) {
      return { success: false, message: 'Tanggal jatuh tempo tidak boleh sebelum tanggal terbit.' };
    }

    // Filter out blank placeholder items
    const validItems = (v.items || []).filter(
      (item) => item.description?.trim() || (item.quantity > 0 && item.unit_price > 0)
    );
    if (validItems.length === 0) {
      return { success: false, message: 'Minimal satu item pekerjaan dengan deskripsi dan kuantitas harus tersedia.' };
    }
    for (const item of validItems) {
      if (!item.description?.trim()) {
        return { success: false, message: 'Deskripsi pada setiap baris item pekerjaan wajib diisi.' };
      }
      if (item.quantity <= 0) {
        return { success: false, message: `Kuantitas untuk "${item.description}" harus lebih dari 0.` };
      }
      if (item.unit_price < 0) {
        return { success: false, message: `Harga satuan untuk "${item.description}" tidak boleh negatif.` };
      }
    }
    v.items = validItems;

    // Recalculate totals to guarantee accuracy before publishing
    v.subtotal = v.items.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
    let discountAmount = 0;
    if (v.discount_value > 0) {
      if (v.discount_type === 'percent') {
        discountAmount = Math.round(v.subtotal * (Math.min(100, Math.max(0, v.discount_value)) / 100));
      } else {
        discountAmount = Math.min(v.subtotal, Math.max(0, v.discount_value));
      }
    }
    v.discount_amount = discountAmount;
    const taxableBase = Math.max(0, v.subtotal - discountAmount);
    v.tax_amount = v.tax_enabled ? Math.round(taxableBase * (Math.max(0, v.tax_rate) / 100)) : 0;
    v.grand_total = taxableBase + v.tax_amount;
    v.terbilang = angkaKeTerbilang(v.grand_total);

    // Allocate atomic invoice number if not already allocated
    if (!invoice.invoice_number) {
      const { invoiceNumber, sequenceNumber } = this.generateNextInvoiceNumber(v.issue_date);
      invoice.invoice_number = invoiceNumber;
      invoice.sequence_number = sequenceNumber;
    }

    // Save immutable snapshots of publisher, bank, and logo for this version
    v.publisher_snapshot = {
      name: this.settings.publisher_name,
      sub_name: this.settings.publisher_sub_name,
      city: this.settings.publisher_city,
      country: this.settings.publisher_country,
      phone: this.settings.publisher_phone,
      email: this.settings.publisher_email,
      logo_url: this.settings.logo_url,
    };
    v.bank_snapshot = v.bank_snapshot?.account_number ? v.bank_snapshot : {
      bank_name: this.settings.bank_name,
      account_number: this.settings.bank_account_no,
      account_name: this.settings.bank_account_name,
    };
    if (!v.bank_accounts_snapshot || v.bank_accounts_snapshot.length === 0) {
      v.bank_accounts_snapshot = this.getBankAccounts();
    }
    if (!v.general_clauses || v.general_clauses.length === 0) {
      v.general_clauses = this.getGeneralClauses();
    }
    v.logo_snapshot_url = this.settings.logo_url;

    // Generate cryptographically secure token (32 bytes entropy)
    const rawToken = generateSecureToken();
    const tokenHash = await hashToken(rawToken);

    // Save token mapping
    this.tokensMap[tokenHash] = {
      invoiceId: invoice.id,
      versionId: v.id,
      isActive: true,
    };
    this.save(STORAGE_KEYS.TOKENS, this.tokensMap);

    // Generate selectable-text PDF snapshot (non-blocking for publishing)
    try {
      await generateInvoicePDF({
        invoiceNumber: invoice.invoice_number,
        version: v,
        attachments: v.attachments || invoice.attachments || [],
        createdByName: invoice.created_by_name || v.created_by_name,
      });
      v.pdf_storage_path = `invoice_${invoice.invoice_number.replace(/[^a-zA-Z0-9]/g, '_')}_v${invoice.revision_number}.pdf`;
    } catch (pdfErr) {
      console.warn('PDF snapshot pre-generation note:', pdfErr);
      v.pdf_storage_path = `invoice_${invoice.invoice_number.replace(/[^a-zA-Z0-9]/g, '_')}_v${invoice.revision_number}.pdf`;
    }

    invoice.status = 'Terbit';
    invoice.active_token = rawToken;
    invoice.updated_at = new Date().toISOString();

    this.save(STORAGE_KEYS.INVOICES, this.invoices);

    // Explicit server publish registration for instant global availability
    try {
      fetch('/api/invoices/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice,
          token: rawToken,
          tokenHash,
        }),
      }).catch((e) => console.warn('Background server publish sync note:', e));
    } catch (e) {
      // non-blocking
    }

    this.recordAuditLog('INVOICE', invoice.id, `Menerbitkan invoice resmi nomor ${invoice.invoice_number} (Versi ${invoice.revision_number})`);

    return { success: true, message: `Invoice ${invoice.invoice_number} berhasil diterbitkan!`, invoice };
  }

  // Revoke / Regenerate recipient token (Owner/Admin only)
  public async regenerateShareToken(invoiceId: string): Promise<{ success: boolean; message: string; token?: string }> {
    const active = this.getActiveUser();
    if (active.role !== 'OWNER' && active.role !== 'ADMIN') {
      return { success: false, message: 'Hanya Owner atau Admin yang dapat mengelola token akses penerima.' };
    }

    const invoice = this.getInvoiceById(invoiceId);
    if (!invoice || invoice.status !== 'Terbit') {
      return { success: false, message: 'Invoice tidak ditemukan atau belum terbit.' };
    }

    // Revoke existing tokens for this invoice
    for (const [hash, data] of Object.entries(this.tokensMap)) {
      if (data.invoiceId === invoice.id) {
        data.isActive = false;
      }
    }

    // Generate new token
    const newRawToken = generateSecureToken();
    const newHash = await hashToken(newRawToken);

    this.tokensMap[newHash] = {
      invoiceId: invoice.id,
      versionId: invoice.current_version.id,
      isActive: true,
    };
    this.save(STORAGE_KEYS.TOKENS, this.tokensMap);

    invoice.active_token = newRawToken;
    invoice.updated_at = new Date().toISOString();
    this.save(STORAGE_KEYS.INVOICES, this.invoices);

    this.recordAuditLog('TOKEN', invoice.id, `Mencabut dan membuat ulang link penerima untuk invoice ${invoice.invoice_number}`);
    return { success: true, message: 'Link penerima berhasil diperbarui.', token: newRawToken };
  }

  public revokeShareToken(invoiceId: string): { success: boolean; message: string } {
    const active = this.getActiveUser();
    if (active.role !== 'OWNER' && active.role !== 'ADMIN') {
      return { success: false, message: 'Hanya Owner atau Admin yang dapat mencabut link penerima.' };
    }

    const invoice = this.getInvoiceById(invoiceId);
    if (!invoice) return { success: false, message: 'Invoice tidak ditemukan.' };

    for (const [hash, data] of Object.entries(this.tokensMap)) {
      if (data.invoiceId === invoice.id) {
        data.isActive = false;
      }
    }
    this.save(STORAGE_KEYS.TOKENS, this.tokensMap);

    invoice.active_token = undefined;
    invoice.updated_at = new Date().toISOString();
    this.save(STORAGE_KEYS.INVOICES, this.invoices);

    this.recordAuditLog('TOKEN', invoice.id, `Mencabut link akses penerima untuk invoice ${invoice.invoice_number}`);
    return { success: true, message: 'Link akses penerima berhasil dicabut.' };
  }

  // Cancel Invoice (Owner/Admin)
  public cancelInvoice(invoiceId: string, reason: string): { success: boolean; message: string } {
    const active = this.getActiveUser();
    if (active.role !== 'OWNER' && active.role !== 'ADMIN') {
      return { success: false, message: 'Hanya Owner atau Admin yang dapat membatalkan invoice.' };
    }

    const invoice = this.getInvoiceById(invoiceId);
    if (!invoice) return { success: false, message: 'Invoice tidak ditemukan.' };

    // Revoke public tokens
    for (const [hash, data] of Object.entries(this.tokensMap)) {
      if (data.invoiceId === invoice.id) {
        data.isActive = false;
      }
    }
    this.save(STORAGE_KEYS.TOKENS, this.tokensMap);

    invoice.status = 'Dibatalkan';
    invoice.payment_status = 'dibatalkan';
    invoice.active_token = undefined;
    invoice.updated_at = new Date().toISOString();
    this.save(STORAGE_KEYS.INVOICES, this.invoices);

    this.recordAuditLog('INVOICE', invoice.id, `Membatalkan invoice ${invoice.invoice_number || invoice.id}: ${reason}`);
    return { success: true, message: 'Invoice berhasil dibatalkan.' };
  }

  // Duplicate Invoice
  // Creates brand new invoice draft, resets status, payments, approval, token, PDF, dates.
  // Prompts user to select or confirm client from master. Copies item descriptions & units only.
  // Resets qty and price to 0/empty. Resets discount & tax to off.
  public duplicateInvoice(originalInvoiceId: string, selectedClientId?: string): {
    success: boolean;
    message: string;
    invoice?: Invoice;
  } {
    const active = this.getActiveUser();
    if (active.role === 'VIEWER') {
      return { success: false, message: 'Viewer tidak dapat menduplikasi invoice.' };
    }

    const original = this.getInvoiceById(originalInvoiceId);
    if (!original) return { success: false, message: 'Invoice asal tidak ditemukan.' };

    const targetClientId = selectedClientId || original.client_id || (this.clients[0]?.id);
    const client = targetClientId ? this.getClientById(targetClientId) : null;
    const clientSnapshot = client
      ? {
          sapaan: client.sapaan,
          pic_name: client.pic_name,
          company_name: client.company_name,
          billing_address: client.billing_address,
          email: client.email,
          whatsapp: client.whatsapp,
        }
      : original.current_version.client_snapshot;

    const now = new Date();
    const todayYear = now.getFullYear();
    const todayMonth = now.getMonth();
    const todayDay = now.getDate();
    const newIssueDate = `${todayYear}-${String(todayMonth + 1).padStart(2, '0')}-${String(todayDay).padStart(2, '0')}`;

    // Hitung tanggal jatuh tempo baru mempertahankan interval hari dokumen asal (default 14 hari)
    let dueDayOffset = 14;
    if (original.current_version.issue_date && original.current_version.due_date) {
      const origIssue = new Date(original.current_version.issue_date);
      const origDue = new Date(original.current_version.due_date);
      const diff = Math.round((origDue.getTime() - origIssue.getTime()) / (1000 * 60 * 60 * 24));
      if (diff > 0 && diff < 365) {
        dueDayOffset = diff;
      }
    }
    const dueObj = new Date(now.getTime() + dueDayOffset * 24 * 60 * 60 * 1000);
    const newDueDate = `${dueObj.getFullYear()}-${String(dueObj.getMonth() + 1).padStart(2, '0')}-${String(dueObj.getDate()).padStart(2, '0')}`;

    // Sesuaikan periode tagihan ke bulan dan tahun berjalan
    const newPeriod = adjustPeriodToCurrentMonth(original.current_version.period, now);

    // Alokasikan NOMOR INVOICE BARU secara resmi
    const { invoiceNumber, sequenceNumber } = this.generateNextInvoiceNumber(newIssueDate);

    const newInvoiceId = 'inv-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const newVersionId = 'ver-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    // Duplikat item pekerjaan lengkap dengan jumlah, satuan, harga, dan kurs valas
    // Keterangan bulan pada deskripsi otomatis diselaraskan ke bulan berjalan
    const duplicatedItems: InvoiceItem[] = (original.current_version.items || []).map((item, idx) => ({
      id: 'item-' + idx + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      sort_order: idx + 1,
      description: adjustItemDescriptionToCurrentMonth(item.description, now),
      quantity: item.quantity,
      unit: item.unit || 'bulan',
      unit_price: item.unit_price,
      total: item.total,
      currency: item.currency || original.current_version.currency || 'IDR',
      custom_exchange_rate: item.custom_exchange_rate || original.current_version.custom_exchange_rate || this.settings.default_usd_rate || 16250,
      unit_price_usd: item.unit_price_usd || 0,
      total_usd: item.total_usd || 0,
    }));

    // Hitung ulang total matematis agar presisi
    const subtotal = duplicatedItems.reduce((s, it) => s + (Number(it.total) || 0), 0);
    let discountAmount = 0;
    if (original.current_version.discount_value > 0) {
      if (original.current_version.discount_type === 'percent') {
        discountAmount = Math.round(subtotal * (Math.min(100, Math.max(0, original.current_version.discount_value)) / 100));
      } else {
        discountAmount = Math.min(subtotal, Math.max(0, original.current_version.discount_value));
      }
    }
    const taxableBase = Math.max(0, subtotal - discountAmount);
    const taxAmount = original.current_version.tax_enabled
      ? Math.round(taxableBase * (Math.max(0, original.current_version.tax_rate) / 100))
      : 0;
    const grandTotal = taxableBase + taxAmount;
    const terbilang = angkaKeTerbilang(grandTotal);

    const effectiveExchangeRate = getEffectiveExchangeRate(
      duplicatedItems,
      original.current_version.custom_exchange_rate || this.settings.default_usd_rate || 16250
    );

    const newVersion: InvoiceVersion = {
      id: newVersionId,
      invoice_id: newInvoiceId,
      version_number: 1,
      issue_date: newIssueDate,
      due_date: newDueDate,
      period: newPeriod,
      client_snapshot: clientSnapshot,
      publisher_snapshot: {
        name: this.settings.publisher_name,
        sub_name: this.settings.publisher_sub_name,
        city: this.settings.publisher_city,
        country: this.settings.publisher_country,
        phone: this.settings.publisher_phone,
        email: this.settings.publisher_email,
        logo_url: this.settings.logo_url,
      },
      bank_snapshot: {
        bank_name: this.settings.bank_name,
        account_number: this.settings.bank_account_no,
        account_name: this.settings.bank_account_name,
      },
      logo_snapshot_url: this.settings.logo_url,
      items: duplicatedItems,
      currency: original.current_version.currency || 'IDR',
      custom_exchange_rate: effectiveExchangeRate,
      subtotal,
      subtotal_usd: duplicatedItems.reduce((s, it) => s + (it.currency === 'USD' ? (Number(it.total_usd) || 0) : 0), 0),
      discount_type: original.current_version.discount_type || 'percent',
      discount_value: original.current_version.discount_value || 0,
      discount_amount: discountAmount,
      tax_enabled: original.current_version.tax_enabled || false,
      tax_rate: original.current_version.tax_rate || 11,
      tax_amount: taxAmount,
      grand_total: grandTotal,
      grand_total_usd: duplicatedItems.reduce((s, it) => s + (it.currency === 'USD' ? (Number(it.total_usd) || 0) : 0), 0),
      terbilang,
      client_notes: original.current_version.client_notes || this.settings.default_client_notes,
      work_terms: original.current_version.work_terms || this.settings.default_work_terms,
      payment_terms: original.current_version.payment_terms || this.settings.default_payment_terms,
      attachments: [], // Lampiran lama sengaja tidak diduplikat otomatis agar rapi
      created_at: now.toISOString(),
    };

    const newInvoice: Invoice = {
      id: newInvoiceId,
      invoice_number: invoiceNumber,
      sequence_number: sequenceNumber,
      revision_number: 1,
      status: 'Draft',
      payment_status: 'Belum Bayar',
      client_id: client ? client.id : original.client_id,
      assigned_user_id: active.id,
      current_version: newVersion,
      payments: [],
      attachments: [],
      created_by_id: active.id,
      created_by_name: active.full_name,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };

    this.invoices.push(newInvoice);
    this.save(STORAGE_KEYS.INVOICES, this.invoices);
    this.recordAuditLog(
      'INVOICE',
      newInvoice.id,
      `Menduplikasi invoice ${original.invoice_number || original.id} menjadi invoice baru ${invoiceNumber} untuk periode ${newPeriod}`
    );

    return {
      success: true,
      message: `Invoice berhasil diduplikasi menjadi nomor baru ${invoiceNumber} untuk periode ${newPeriod}. Silakan sesuaikan rincian tagihan untuk bulan berjalan.`,
      invoice: newInvoice,
    };
  }

  // Create Revision Draft from published invoice
  public createRevisionDraft(originalInvoiceId: string): { success: boolean; message: string; invoice?: Invoice } {
    const active = this.getActiveUser();
    if (active.role === 'VIEWER') {
      return { success: false, message: 'Viewer tidak dapat membuat revisi.' };
    }

    const original = this.getInvoiceById(originalInvoiceId);
    if (!original || original.status !== 'Terbit') {
      return { success: false, message: 'Hanya invoice berstatus Terbit yang dapat direvisi.' };
    }

    const newVersionNumber = original.revision_number + 1;
    const now = new Date().toISOString();

    // Clone items
    const clonedItems: InvoiceItem[] = original.current_version.items.map((i) => ({ ...i }));

    const newVersion: InvoiceVersion = {
      ...original.current_version,
      id: 'ver-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      version_number: newVersionNumber,
      items: clonedItems,
      created_at: now,
    };

    // Update invoice to point to new draft revision
    original.status = 'Draft';
    original.revision_number = newVersionNumber;
    original.current_version = newVersion;
    original.updated_at = now;

    this.save(STORAGE_KEYS.INVOICES, this.invoices);
    this.recordAuditLog('INVOICE', original.id, `Membuat draft revisi ke-${newVersionNumber - 1} untuk invoice ${original.invoice_number}`);

    return { success: true, message: `Draft revisi ke-${newVersionNumber - 1} berhasil disiapkan.`, invoice: original };
  }

  // --- Payment Records (Owner/Admin only) ---
  public recordPayment(
    invoiceId: string,
    paymentData: {
      amount: number;
      paymentDate: string;
      paymentMethod: string;
      referenceNumber?: string;
      notes?: string;
    }
  ): { success: boolean; message: string } {
    const active = this.getActiveUser();
    if (active.role !== 'OWNER' && active.role !== 'ADMIN') {
      return { success: false, message: 'Hanya Owner atau Admin yang berwenang mencatat pembayaran.' };
    }

    const invoice = this.getInvoiceById(invoiceId);
    if (!invoice || invoice.status !== 'Terbit') {
      return { success: false, message: 'Pembayaran hanya dapat dicatat pada invoice yang sudah terbit.' };
    }

    const totalValidPayments = invoice.payments
      .filter((p) => !p.is_reversed)
      .reduce((sum, p) => sum + p.amount, 0);

    const remainingBalance = invoice.current_version.grand_total - totalValidPayments;

    if (paymentData.amount <= 0) {
      return { success: false, message: 'Nominal pembayaran harus lebih dari nol.' };
    }
    if (paymentData.amount > remainingBalance) {
      return { success: false, message: `Nominal pembayaran melebihi sisa tagihan (${remainingBalance}).` };
    }

    const newPayment: PaymentRecord = {
      id: 'pay-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      invoice_id: invoice.id,
      amount: paymentData.amount,
      payment_date: paymentData.paymentDate || new Date().toISOString().slice(0, 10),
      payment_method: paymentData.paymentMethod || 'Transfer Bank blu by BCA Digital',
      reference_number: paymentData.referenceNumber,
      notes: paymentData.notes,
      recorded_by_id: active.id,
      recorded_by_name: active.full_name,
      is_reversed: false,
      created_at: new Date().toISOString(),
    };

    invoice.payments.push(newPayment);

    // Update payment status
    const newTotal = totalValidPayments + paymentData.amount;
    if (newTotal >= invoice.current_version.grand_total) {
      invoice.payment_status = 'Sudah di bayar';
    } else {
      invoice.payment_status = 'Dibayar sebagian';
    }

    invoice.updated_at = new Date().toISOString();
    this.save(STORAGE_KEYS.INVOICES, this.invoices);

    this.recordAuditLog('PAYMENT', invoice.id, `Mencatat pembayaran ${paymentData.amount} untuk invoice ${invoice.invoice_number}`);
    return { success: true, message: 'Pembayaran berhasil dicatat.' };
  }

  // Payment reversal
  public reversePayment(invoiceId: string, paymentId: string, reason: string): { success: boolean; message: string } {
    const active = this.getActiveUser();
    if (active.role !== 'OWNER' && active.role !== 'ADMIN') {
      return { success: false, message: 'Hanya Owner atau Admin yang dapat membatalkan pembayaran.' };
    }

    const invoice = this.getInvoiceById(invoiceId);
    if (!invoice) return { success: false, message: 'Invoice tidak ditemukan.' };

    const payment = invoice.payments.find((p) => p.id === paymentId);
    if (!payment) return { success: false, message: 'Data pembayaran tidak ditemukan.' };
    if (payment.is_reversed) return { success: false, message: 'Pembayaran ini sudah pernah dibatalkan sebelumnya.' };

    if (!reason?.trim()) {
      return { success: false, message: 'Alasan pembatalan pembayaran wajib diisi.' };
    }

    payment.is_reversed = true;
    payment.reversal_reason = reason.trim();
    payment.reversed_at = new Date().toISOString();
    payment.reversed_by_name = active.full_name;

    // Recalculate payment status
    const remainingValidPayments = invoice.payments
      .filter((p) => !p.is_reversed)
      .reduce((sum, p) => sum + p.amount, 0);

    if (remainingValidPayments <= 0) {
      invoice.payment_status = 'Belum Bayar';
    } else if (remainingValidPayments < invoice.current_version.grand_total) {
      invoice.payment_status = 'Dibayar sebagian';
    } else {
      invoice.payment_status = 'Sudah di bayar';
    }

    invoice.updated_at = new Date().toISOString();
    this.save(STORAGE_KEYS.INVOICES, this.invoices);

    this.recordAuditLog('PAYMENT', invoice.id, `Membatalkan pembayaran ${payment.amount} dengan alasan: ${reason.trim()}`);
    return { success: true, message: 'Pembayaran berhasil dibatalkan (reversal dicatat).' };
  }

  // --- Public Recipient Access by Token ---
  public async getInvoiceByRecipientToken(rawToken: string): Promise<{
    found: boolean;
    isCanceled?: boolean;
    invoice?: Invoice;
    paymentSummary?: {
      totalPaid: number;
      remainingBalance: number;
      isLunas: boolean;
      payments: { date: string; amount: number; method: string }[];
    };
  }> {
    if (!rawToken || !rawToken.trim()) {
      return { found: false };
    }

    const cleanToken = rawToken.trim();

    // Helper to calculate summary from invoice
    const buildResult = (inv: Invoice) => {
      const isCanceled = inv.status === 'Dibatalkan';
      const validPayments = (inv.payments || []).filter((p) => !p.is_reversed);
      const totalPaid = validPayments.reduce((s, p) => s + p.amount, 0);
      const grandTotal = Number(inv.current_version?.grand_total) || 0;
      const remainingBalance = Math.max(0, grandTotal - totalPaid);

      return {
        found: true,
        isCanceled,
        invoice: inv,
        paymentSummary: {
          totalPaid,
          remainingBalance,
          isLunas: remainingBalance === 0,
          payments: validPayments.map((p) => ({
            date: p.payment_date,
            amount: p.amount,
            method: p.payment_method,
          })),
        },
      };
    };

    // 1. Check local memory / storage first
    let localInvoice = this.invoices.find((i) => i.active_token === cleanToken);
    if (!localInvoice) {
      try {
        const tokenHash = await hashToken(cleanToken);
        const tokenInfo = this.tokensMap[tokenHash] || this.tokensMap[cleanToken];
        if (tokenInfo && tokenInfo.isActive !== false) {
          localInvoice = this.getInvoiceById(tokenInfo.invoiceId);
        }
      } catch (e) {
        // ignore hash error
      }
    }

    if (!localInvoice) {
      localInvoice = this.invoices.find(
        (i) =>
          (i.id === cleanToken || i.invoice_number === cleanToken) &&
          (i.status === 'Terbit' || i.status === 'Dibatalkan')
      );
    }

    if (localInvoice && (localInvoice.status === 'Terbit' || localInvoice.status === 'Dibatalkan')) {
      return buildResult(localInvoice);
    }

    // 2. Fetch from Server API (/api/invoices/public/:token)
    // Ensures any recipient on any device, WhatsApp, new tab, or incognito loads the document!
    try {
      const resp = await fetch(`/api/invoices/public/${encodeURIComponent(cleanToken)}`);
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.found && data.invoice) {
          // Cache in local memory
          if (!this.invoices.some((i) => i.id === data.invoice.id)) {
            this.invoices.push(data.invoice);
            this.save(STORAGE_KEYS.INVOICES, this.invoices, false);
          }
          return data;
        }
      }
    } catch (apiErr) {
      console.warn('Server public invoice fetch error:', apiErr);
    }

    return { found: false };
  }

  // --- Message Templates ---
  public getTemplates(): MessageTemplate[] {
    return [...this.templates];
  }

  public saveTemplate(tplData: Omit<MessageTemplate, 'id' | 'created_at' | 'updated_at'> & { id?: string }): {
    success: boolean;
    message: string;
    template?: MessageTemplate;
  } {
    const active = this.getActiveUser();
    if (active.role !== 'OWNER' && active.role !== 'ADMIN') {
      return { success: false, message: 'Hanya Owner atau Admin yang dapat mengelola template pesan.' };
    }

    const now = new Date().toISOString();

    if (tplData.id) {
      const idx = this.templates.findIndex((t) => t.id === tplData.id);
      if (idx === -1) return { success: false, message: 'Template tidak ditemukan.' };

      const updated: MessageTemplate = {
        ...this.templates[idx],
        ...tplData,
        id: this.templates[idx].id,
        updated_at: now,
      };
      this.templates[idx] = updated;
      this.save(STORAGE_KEYS.TEMPLATES, this.templates);
      this.recordAuditLog('TEMPLATE', updated.id, `Memperbarui template pesan: ${updated.title}`);
      return { success: true, message: 'Template berhasil diperbarui.', template: updated };
    } else {
      const newTpl: MessageTemplate = {
        ...tplData,
        id: 'tpl-' + Date.now().toString(36),
        created_at: now,
        updated_at: now,
      };
      this.templates.push(newTpl);
      this.save(STORAGE_KEYS.TEMPLATES, this.templates);
      this.recordAuditLog('TEMPLATE', newTpl.id, `Membuat template pesan baru: ${newTpl.title}`);
      return { success: true, message: 'Template baru berhasil dibuat.', template: newTpl };
    }
  }

  public deleteTemplate(id: string): { success: boolean; message: string } {
    const active = this.getActiveUser();
    if (active.role !== 'OWNER' && active.role !== 'ADMIN') {
      return { success: false, message: 'Hanya Owner atau Admin yang dapat menghapus template pesan.' };
    }

    const tpl = this.templates.find((t) => t.id === id);
    if (!tpl) return { success: false, message: 'Template tidak ditemukan.' };
    if (tpl.is_default) {
      return { success: false, message: 'Template default tidak boleh dihapus.' };
    }

    this.templates = this.templates.filter((t) => t.id !== id);
    this.save(STORAGE_KEYS.TEMPLATES, this.templates);
    this.recordAuditLog('TEMPLATE', id, `Menghapus template pesan: ${tpl.title}`);
    return { success: true, message: 'Template berhasil dihapus.' };
  }

  // --- Audit Logs ---
  public getAuditLogs(): AuditLog[] {
    return [...this.auditLogs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  public recordAuditLog(entityType: AuditLog['entity_type'], entityId: string, details: string) {
    const active = this.getActiveUser();
    const log: AuditLog = {
      id: 'log-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      user_id: active.id,
      user_name: active.full_name,
      user_email: active.email,
      user_role: active.role,
      action: details,
      entity_type: entityType,
      entity_id: entityId,
      details,
      created_at: new Date().toISOString(),
    };

    this.auditLogs.unshift(log);
    // Keep max 500 logs in storage
    if (this.auditLogs.length > 500) {
      this.auditLogs = this.auditLogs.slice(0, 500);
    }
    this.save(STORAGE_KEYS.AUDIT_LOGS, this.auditLogs);
  }

  // Convenience Aliases & Helpers
  public getCurrentUser(): UserProfile {
    return this.getActiveUser();
  }

  public switchActiveUser(userId: string): void {
    this.setActiveUser(userId);
  }

  public addUser(params: {
    email: string;
    fullName: string;
    role: UserRole;
    username?: string;
    password?: string;
  }) {
    return this.inviteUser(params.email, params.fullName, params.role, params.username, params.password);
  }

  public toggleUserStatus(userId: string) {
    return this.toggleUserActiveStatus(userId);
  }

  public deleteClient(id: string): { success: boolean; message: string } {
    const active = this.getActiveUser();
    if (active.role === 'VIEWER') {
      return { success: false, message: 'Viewer tidak memiliki izin menghapus klien.' };
    }
    const idx = this.clients.findIndex((c) => c.id === id);
    if (idx === -1) return { success: false, message: 'Klien tidak ditemukan.' };
    const name = this.clients[idx].company_name;
    this.clients.splice(idx, 1);
    this.save(STORAGE_KEYS.CLIENTS, this.clients);
    this.recordAuditLog('CLIENT', id, `Menghapus klien: ${name}`);
    return { success: true, message: 'Klien berhasil dihapus.' };
  }

  public async getInvoiceByToken(token: string) {
    return this.getInvoiceByRecipientToken(token);
  }

  public updateTemplate(id: string, data: { name?: string; title?: string; body?: string }): { success: boolean; message: string } {
    const tpl = this.templates.find((t) => t.id === id);
    if (!tpl) return { success: false, message: 'Template tidak ditemukan' };
    if (data.name) {
      tpl.name = data.name;
      tpl.title = data.name;
    }
    if (data.title) {
      tpl.title = data.title;
      tpl.name = data.title;
    }
    if (data.body !== undefined) tpl.body = data.body;
    tpl.updated_at = new Date().toISOString();
    this.save(STORAGE_KEYS.TEMPLATES, this.templates);
    this.recordAuditLog('TEMPLATE', id, `Memperbarui template pesan: ${tpl.title || tpl.name}`);
    return { success: true, message: 'Template berhasil diperbarui.' };
  }

  // --- Attachments Management ---
  public addInvoiceAttachment(
    invoiceId: string,
    attachment: InvoiceAttachment
  ): { success: boolean; message: string; attachment?: InvoiceAttachment } {
    const active = this.getActiveUser();
    if (active.role === 'VIEWER') {
      return { success: false, message: 'Viewer tidak memiliki izin menambahkan lampiran.' };
    }

    const invoice = this.getInvoiceById(invoiceId);
    if (!invoice) return { success: false, message: 'Invoice tidak ditemukan.' };

    const currentAttachments = invoice.current_version.attachments || [];
    const updated = [...currentAttachments, attachment];

    invoice.current_version.attachments = updated;
    invoice.attachments = updated;
    invoice.updated_at = new Date().toISOString();

    this.save(STORAGE_KEYS.INVOICES, this.invoices);
    this.recordAuditLog(
      'INVOICE',
      invoice.id,
      `Menambahkan lampiran "${attachment.name}" (${attachment.category}) pada invoice ${invoice.invoice_number || invoice.id}`
    );

    return { success: true, message: 'Lampiran berhasil ditambahkan.', attachment };
  }

  public deleteInvoiceAttachment(
    invoiceId: string,
    attachmentId: string
  ): { success: boolean; message: string } {
    const active = this.getActiveUser();
    if (active.role === 'VIEWER') {
      return { success: false, message: 'Viewer tidak memiliki izin menghapus lampiran.' };
    }

    const invoice = this.getInvoiceById(invoiceId);
    if (!invoice) return { success: false, message: 'Invoice tidak ditemukan.' };

    const currentAttachments = invoice.current_version.attachments || [];
    const attToDelete = currentAttachments.find((a) => a.id === attachmentId);
    const updated = currentAttachments.filter((a) => a.id !== attachmentId);

    invoice.current_version.attachments = updated;
    invoice.attachments = updated;
    invoice.updated_at = new Date().toISOString();

    this.save(STORAGE_KEYS.INVOICES, this.invoices);
    this.recordAuditLog(
      'INVOICE',
      invoice.id,
      `Menghapus lampiran "${attToDelete?.name || attachmentId}" dari invoice ${invoice.invoice_number || invoice.id}`
    );

    return { success: true, message: 'Lampiran berhasil dihapus.' };
  }

  public updateInvoiceAttachments(
    invoiceId: string,
    attachments: InvoiceAttachment[]
  ): { success: boolean; message: string } {
    const active = this.getActiveUser();
    if (active.role === 'VIEWER') {
      return { success: false, message: 'Viewer tidak memiliki izin mengubah lampiran.' };
    }

    const invoice = this.getInvoiceById(invoiceId);
    if (!invoice) return { success: false, message: 'Invoice tidak ditemukan.' };

    invoice.current_version.attachments = attachments;
    invoice.attachments = attachments;
    invoice.updated_at = new Date().toISOString();

    this.save(STORAGE_KEYS.INVOICES, this.invoices);
    return { success: true, message: 'Daftar lampiran berhasil diperbarui.' };
  }

  // --- Update Single Invoice Payment Status ---
  public updateInvoicePaymentStatus(
    invoiceId: string,
    newStatus: PaymentStatus,
    note?: string
  ): { success: boolean; message: string } {
    const active = this.getActiveUser();
    if (active.role === 'VIEWER') {
      return { success: false, message: 'Viewer tidak memiliki izin mengubah keterangan pembayaran.' };
    }

    const invoice = this.getInvoiceById(invoiceId);
    if (!invoice) return { success: false, message: 'Invoice tidak ditemukan.' };

    const canonicalStatus = normalizePaymentStatus(newStatus);
    const oldStatus = invoice.payment_status;
    invoice.payment_status = canonicalStatus;

    if (!invoice.payments) invoice.payments = [];
    const grandTotal = invoice.current_version?.grand_total || 0;
    const currentPaid = invoice.payments
      .filter((p) => !p.is_reversed)
      .reduce((s, p) => s + (p.amount || 0), 0);

    if (canonicalStatus === 'Sudah di bayar' && currentPaid < grandTotal && grandTotal > 0) {
      invoice.payments.push({
        id: 'pay-sync-' + Date.now().toString(36),
        invoice_id: invoice.id,
        amount: grandTotal - currentPaid,
        payment_date: new Date().toISOString().slice(0, 10),
        payment_method: 'Transfer Bank blu by BCA Digital',
        reference_number: 'LUNAS',
        notes: note || 'Pelunasan invoice terkonfirmasi',
        recorded_by_id: active.id,
        recorded_by_name: active.full_name,
        is_reversed: false,
        created_at: new Date().toISOString(),
      });
    } else if (canonicalStatus === 'Belum Bayar') {
      // Revert/reverse auto payments if switching back to Belum Bayar
      invoice.payments = invoice.payments.filter((p) => !p.id.startsWith('pay-sync-'));
    }

    if (canonicalStatus === 'dibatalkan' && invoice.status !== 'Dibatalkan') {
      invoice.status = 'Dibatalkan';
      invoice.active_token = undefined;
    }

    invoice.updated_at = new Date().toISOString();
    this.save(STORAGE_KEYS.INVOICES, this.invoices);

    this.recordAuditLog(
      'INVOICE',
      invoice.id,
      `Mengubah keterangan pembayaran dari "${oldStatus}" menjadi "${canonicalStatus}"${note ? ` (${note})` : ''}`
    );

    return {
      success: true,
      message: `Keterangan pembayaran berhasil diperbarui menjadi "${canonicalStatus}".`,
    };
  }

  // --- Bulk Update Payment Status ---
  public bulkUpdatePaymentStatus(
    invoiceIds: string[],
    newStatus: PaymentStatus,
    note?: string
  ): { success: boolean; updatedCount: number; message: string } {
    const active = this.getActiveUser();
    if (active.role === 'VIEWER') {
      return {
        success: false,
        updatedCount: 0,
        message: 'Viewer tidak memiliki izin mengubah keterangan pembayaran massal.',
      };
    }

    if (!invoiceIds || invoiceIds.length === 0) {
      return { success: false, updatedCount: 0, message: 'Tidak ada invoice yang dipilih.' };
    }

    const canonicalStatus = normalizePaymentStatus(newStatus);
    let updatedCount = 0;

    for (const id of invoiceIds) {
      const inv = this.getInvoiceById(id);
      if (inv) {
        inv.payment_status = canonicalStatus;
        if (!inv.payments) inv.payments = [];
        const grandTotal = inv.current_version?.grand_total || 0;
        const currentPaid = inv.payments
          .filter((p) => !p.is_reversed)
          .reduce((s, p) => s + (p.amount || 0), 0);

        if (canonicalStatus === 'Sudah di bayar' && currentPaid < grandTotal && grandTotal > 0) {
          inv.payments.push({
            id: 'pay-sync-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 5),
            invoice_id: inv.id,
            amount: grandTotal - currentPaid,
            payment_date: new Date().toISOString().slice(0, 10),
            payment_method: 'Transfer Bank blu by BCA Digital',
            reference_number: 'LUNAS',
            notes: note || 'Pelunasan invoice massal',
            recorded_by_id: active.id,
            recorded_by_name: active.full_name,
            is_reversed: false,
            created_at: new Date().toISOString(),
          });
        } else if (canonicalStatus === 'Belum Bayar') {
          inv.payments = inv.payments.filter((p) => !p.id.startsWith('pay-sync-'));
        }

        if (canonicalStatus === 'dibatalkan') {
          inv.status = 'Dibatalkan';
          inv.active_token = undefined;
        }
        inv.updated_at = new Date().toISOString();
        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      this.save(STORAGE_KEYS.INVOICES, this.invoices);
      this.recordAuditLog(
        'INVOICE',
        'BULK_EDIT',
        `Mengubah keterangan pembayaran ${updatedCount} invoice terpilih menjadi "${canonicalStatus}"${note ? ` (${note})` : ''}`
      );
    }

    return {
      success: true,
      updatedCount,
      message: `Berhasil memperbarui ${updatedCount} invoice menjadi "${canonicalStatus}".`,
    };
  }

  // --- Bulk Publish Invoices ---
  public async bulkPublishInvoices(
    invoiceIds: string[]
  ): Promise<{ success: boolean; publishedCount: number; message: string }> {
    const active = this.getActiveUser();
    if (active.role !== 'OWNER' && active.role !== 'ADMIN') {
      return { success: false, publishedCount: 0, message: 'Hanya Owner atau Admin yang dapat menerbitkan invoice.' };
    }

    let publishedCount = 0;
    for (const id of invoiceIds) {
      const inv = this.getInvoiceById(id);
      if (inv && (inv.status === 'Draft' || inv.status === 'Diajukan')) {
        const res = await this.publishInvoice(id);
        if (res.success) publishedCount++;
      }
    }

    return {
      success: true,
      publishedCount,
      message: `Berhasil menerbitkan ${publishedCount} invoice resmi.`,
    };
  }

  // --- Bulk Cancel Invoices ---
  public bulkCancelInvoices(
    invoiceIds: string[],
    reason: string
  ): { success: boolean; canceledCount: number; message: string } {
    const active = this.getActiveUser();
    if (active.role !== 'OWNER' && active.role !== 'ADMIN') {
      return { success: false, canceledCount: 0, message: 'Hanya Owner atau Admin yang dapat membatalkan invoice.' };
    }

    let canceledCount = 0;
    for (const id of invoiceIds) {
      const inv = this.getInvoiceById(id);
      if (inv && inv.status !== 'Dibatalkan') {
        this.cancelInvoice(id, reason);
        canceledCount++;
      }
    }

    return {
      success: true,
      canceledCount,
      message: `Berhasil membatalkan ${canceledCount} invoice terpilih.`,
    };
  }

  // --- Import Invoices ---
  public async importInvoices(
    items: any[],
    updateExisting: boolean = true
  ): Promise<{ success: boolean; importedCount: number; updatedCount: number; errors: string[] }> {
    const active = this.getActiveUser();
    if (active.role === 'VIEWER') {
      return {
        success: false,
        importedCount: 0,
        updatedCount: 0,
        errors: ['Viewer tidak memiliki izin untuk mengimpor invoice.'],
      };
    }

    let importedCount = 0;
    let updatedCount = 0;
    const errors: string[] = [];
    const now = new Date().toISOString();

    for (const item of items) {
      try {
        const invNum = (item.invoiceNumber || '').trim();
        const existing = this.invoices.find(
          (i) => i.invoice_number && i.invoice_number.toLowerCase() === invNum.toLowerCase()
        );

        if (existing) {
          if (!updateExisting) {
            continue; // skip duplicate
          }

          // Update existing invoice
          existing.payment_status = normalizePaymentStatus(item.paymentStatus);
          if (item.documentStatus) existing.status = item.documentStatus;
          if (existing.current_version) {
            if (item.issueDate) existing.current_version.issue_date = item.issueDate;
            if (item.dueDate) existing.current_version.due_date = item.dueDate;
            if (item.companyName || item.picName) {
              existing.current_version.client_snapshot.company_name = item.companyName || existing.current_version.client_snapshot.company_name;
              existing.current_version.client_snapshot.pic_name = item.picName || existing.current_version.client_snapshot.pic_name;
              if (item.email) existing.current_version.client_snapshot.email = item.email;
              if (item.whatsapp) existing.current_version.client_snapshot.whatsapp = item.whatsapp;
              if (item.billingAddress) existing.current_version.client_snapshot.billing_address = item.billingAddress;
            }
            if (item.items && item.items.length > 0) {
              existing.current_version.items = item.items.map((it: any, idx: number) => ({
                id: 'item-imp-' + idx,
                sort_order: idx + 1,
                description: it.description || 'Pekerjaan',
                quantity: it.quantity || 1,
                unit: it.unit || 'Unit',
                unit_price: it.unitPrice || 0,
                total: it.total || (it.quantity || 1) * (it.unitPrice || 0),
              }));
              existing.current_version.grand_total = item.grandTotal || existing.current_version.items.reduce((s: number, i: any) => s + i.total, 0);
              existing.current_version.terbilang = angkaKeTerbilang(existing.current_version.grand_total);
            }
          }
          existing.updated_at = now;
          updatedCount++;
        } else {
          // Create brand new invoice from imported data
          const newInvoiceId = 'inv-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
          const rawToken = generateSecureToken();
          const tokenHash = await hashToken(rawToken);

          const itemsList: InvoiceItem[] = (item.items || []).map((it: any, idx: number) => ({
            id: 'item-imp-' + idx,
            sort_order: idx + 1,
            description: it.description || 'Item Pekerjaan',
            quantity: it.quantity || 1,
            unit: it.unit || 'Unit',
            unit_price: it.unitPrice || 0,
            total: it.total || (it.quantity || 1) * (it.unitPrice || 0),
          }));

          const subtotal = itemsList.reduce((s, i) => s + i.total, 0);
          const grandTotal = item.grandTotal > 0 ? item.grandTotal : subtotal;

          const newVersion: InvoiceVersion = {
            id: 'v-' + Date.now().toString(36),
            invoice_id: newInvoiceId,
            version_number: 1,
            issue_date: item.issueDate || now.slice(0, 10),
            due_date: item.dueDate || now.slice(0, 10),
            period: item.period || 'Periode Tagihan',
            client_snapshot: {
              sapaan: 'Tn.',
              pic_name: item.picName || 'PIC',
              company_name: item.companyName || 'Perusahaan Klien',
              billing_address: item.billingAddress || '',
              email: item.email || '',
              whatsapp: item.whatsapp || '',
            },
            publisher_snapshot: {
              name: this.settings.publisher_name,
              sub_name: this.settings.publisher_sub_name,
              city: this.settings.publisher_city,
              country: this.settings.publisher_country,
              phone: this.settings.publisher_phone,
              email: this.settings.publisher_email,
              logo_url: this.settings.logo_url,
            },
            bank_snapshot: {
              bank_name: this.settings.bank_name,
              account_number: this.settings.bank_account_no,
              account_name: this.settings.bank_account_name,
            },
            items: itemsList,
            subtotal,
            discount_type: 'nominal',
            discount_value: 0,
            discount_amount: 0,
            tax_enabled: false,
            tax_rate: 0,
            tax_amount: 0,
            grand_total: grandTotal,
            terbilang: angkaKeTerbilang(grandTotal),
            client_notes: item.notes || this.settings.default_client_notes,
            payment_terms: this.settings.default_payment_terms,
            work_terms: this.settings.default_work_terms,
            created_at: now,
          };

          const docStatus: DocumentStatus = item.documentStatus || 'Terbit';
          const paymentStatus = normalizePaymentStatus(item.paymentStatus, docStatus);

          const newInvoice: Invoice = {
            id: newInvoiceId,
            invoice_number: invNum,
            revision_number: 1,
            status: docStatus,
            payment_status: paymentStatus,
            current_version: newVersion,
            payments: [],
            active_token: docStatus === 'Terbit' ? rawToken : undefined,
            created_by_id: active.id,
            created_by_name: active.full_name,
            created_at: now,
            updated_at: now,
          };

          if (docStatus === 'Terbit') {
            this.tokensMap[tokenHash] = {
              invoiceId: newInvoiceId,
              versionId: newVersion.id,
              isActive: true,
            };
          }

          this.invoices.push(newInvoice);
          importedCount++;
        }
      } catch (err: any) {
        errors.push(`Gagal mengimpor baris invoice ${item.invoiceNumber || 'tanpa nomor'}: ${err?.message}`);
      }
    }

    this.save(STORAGE_KEYS.INVOICES, this.invoices);
    this.save(STORAGE_KEYS.TOKENS, this.tokensMap);

    this.recordAuditLog(
      'INVOICE',
      'IMPORT',
      `Mengimpor data invoice: ${importedCount} baru dibuat, ${updatedCount} diperbarui.`
    );

    return {
      success: errors.length === 0 || importedCount > 0 || updatedCount > 0,
      importedCount,
      updatedCount,
      errors,
    };
  }
}

export const dataService = new DataService();
