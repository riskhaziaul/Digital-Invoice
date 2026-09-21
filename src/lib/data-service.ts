import {
  AppSettings,
  AuditLog,
  Client,
  DocumentStatus,
  Invoice,
  InvoiceItem,
  InvoiceVersion,
  MessageTemplate,
  PaymentRecord,
  UserProfile,
  UserRole,
} from '../types';
import { INITIAL_APP_SETTINGS, INITIAL_MESSAGE_TEMPLATES } from './constants';
import { angkaKeTerbilang, bulanKeRomawi } from './terbilang';
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
};

// Initial default owner (for immediate test/bootstrap)
const DEFAULT_OWNER: UserProfile = {
  id: 'usr-owner-1',
  email: 'riskhaziaul@gmail.com',
  full_name: 'Riskha Ziaulhusna (Owner)',
  role: 'OWNER',
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

class DataService {
  private settings: AppSettings = { ...INITIAL_APP_SETTINGS };
  private users: UserProfile[] = [DEFAULT_OWNER];
  private clients: Client[] = []; // Starts strictly EMPTY in production!
  private invoices: Invoice[] = []; // Starts strictly EMPTY in production!
  private templates: MessageTemplate[] = [...INITIAL_MESSAGE_TEMPLATES];
  private auditLogs: AuditLog[] = [];
  private activeUserId: string = DEFAULT_OWNER.id;
  private tokensMap: Record<string, { invoiceId: string; versionId: string; isActive: boolean }> = {};

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      if (typeof window === 'undefined') return;

      const savedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (savedSettings) this.settings = JSON.parse(savedSettings);

      const savedUsers = localStorage.getItem(STORAGE_KEYS.USERS);
      if (savedUsers) this.users = JSON.parse(savedUsers);

      const savedClients = localStorage.getItem(STORAGE_KEYS.CLIENTS);
      if (savedClients) this.clients = JSON.parse(savedClients);

      const savedInvoices = localStorage.getItem(STORAGE_KEYS.INVOICES);
      if (savedInvoices) this.invoices = JSON.parse(savedInvoices);

      const savedTemplates = localStorage.getItem(STORAGE_KEYS.TEMPLATES);
      if (savedTemplates) this.templates = JSON.parse(savedTemplates);

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

  private save(key: string, data: any) {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(key, JSON.stringify(data));
      }
    } catch (e) {
      console.error('Error saving data:', e);
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

  public inviteUser(email: string, fullName: string, role: UserRole): { success: boolean; message: string; user?: UserProfile } {
    const active = this.getActiveUser();
    if (active.role !== 'OWNER') {
      return { success: false, message: 'Hanya OWNER yang dapat mengundang pengguna.' };
    }

    if (!email || !fullName) {
      return { success: false, message: 'Email dan Nama Lengkap wajib diisi.' };
    }

    if (this.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
      return { success: false, message: 'Pengguna dengan email tersebut sudah terdaftar.' };
    }

    const newUser: UserProfile = {
      id: 'usr-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      email: email.trim().toLowerCase(),
      full_name: fullName.trim(),
      role,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.users.push(newUser);
    this.save(STORAGE_KEYS.USERS, this.users);

    this.recordAuditLog('USER', newUser.id, `Mengundang pengguna baru ${newUser.full_name} (${newUser.email}) dengan role ${newUser.role}`);
    return { success: true, message: `Undangan berhasil dibuat untuk ${newUser.email}`, user: newUser };
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
  public generateNextInvoiceNumber(issueDateStr: string): { invoiceNumber: string; sequenceNumber: number } {
    const issueDate = issueDateStr ? new Date(issueDateStr) : new Date();
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
    discountType: 'percent' | 'nominal';
    discountValue: number;
    taxEnabled: boolean;
    taxRate: number;
    clientNotes?: string;
    workTerms?: string;
    paymentTerms?: string;
    assignedUserId?: string;
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

      const updatedVersion: InvoiceVersion = {
        ...existing.current_version,
        issue_date: draftData.issueDate,
        due_date: draftData.dueDate,
        period: draftData.period,
        client_snapshot: draftData.clientSnapshot,
        items: draftData.items,
        subtotal,
        discount_type: draftData.discountType,
        discount_value: draftData.discountValue,
        discount_amount: discountAmount,
        tax_enabled: draftData.taxEnabled,
        tax_rate: draftData.taxRate,
        tax_amount: taxAmount,
        grand_total: grandTotal,
        terbilang,
        client_notes: draftData.clientNotes,
        work_terms: draftData.workTerms,
        payment_terms: draftData.paymentTerms,
      };

      const updatedInvoice: Invoice = {
        ...existing,
        client_id: draftData.clientId,
        assigned_user_id: draftData.assignedUserId || existing.assigned_user_id,
        current_version: updatedVersion,
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
        bank_snapshot: {
          bank_name: this.settings.bank_name,
          account_number: this.settings.bank_account_no,
          account_name: this.settings.bank_account_name,
        },
        logo_snapshot_url: this.settings.logo_url,
        items: draftData.items,
        subtotal,
        discount_type: draftData.discountType,
        discount_value: draftData.discountValue,
        discount_amount: discountAmount,
        tax_enabled: draftData.taxEnabled,
        tax_rate: draftData.taxRate,
        tax_amount: taxAmount,
        grand_total: grandTotal,
        terbilang,
        client_notes: draftData.clientNotes || this.settings.default_client_notes,
        work_terms: draftData.workTerms || this.settings.default_work_terms,
        payment_terms: draftData.paymentTerms || this.settings.default_payment_terms,
        created_at: now,
      };

      const newInvoice: Invoice = {
        id: newInvoiceId,
        revision_number: 1,
        status: 'Draft',
        payment_status: 'Belum Dibayar',
        client_id: draftData.clientId,
        assigned_user_id: draftData.assignedUserId || active.id,
        current_version: newVersion,
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

    // Strict validation before publishing
    if (!v.client_snapshot.pic_name || !v.client_snapshot.company_name) {
      return { success: false, message: 'Nama penerima dan perusahaan wajib diisi.' };
    }
    if (!v.issue_date || !v.due_date || !v.period) {
      return { success: false, message: 'Tanggal terbit, jatuh tempo, dan periode wajib diisi.' };
    }
    if (new Date(v.due_date) < new Date(v.issue_date)) {
      return { success: false, message: 'Tanggal jatuh tempo tidak boleh sebelum tanggal terbit.' };
    }
    if (!v.items || v.items.length === 0) {
      return { success: false, message: 'Minimal satu item pekerjaan lengkap harus tersedia.' };
    }
    for (const item of v.items) {
      if (!item.description || item.quantity <= 0 || item.unit_price < 0) {
        return { success: false, message: 'Setiap item harus memiliki deskripsi, kuantitas > 0, dan harga >= 0.' };
      }
    }

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
    v.bank_snapshot = {
      bank_name: this.settings.bank_name,
      account_number: this.settings.bank_account_no,
      account_name: this.settings.bank_account_name,
    };
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

    // Generate selectable-text PDF snapshot
    try {
      const pdfBytes = await generateInvoicePDF({
        invoiceNumber: invoice.invoice_number,
        version: v,
      });
      // Store PDF path or blob reference
      v.pdf_storage_path = `invoice_${invoice.invoice_number.replace(/[^a-zA-Z0-9]/g, '_')}_v${invoice.revision_number}.pdf`;
      // In local mode, save a temporary cache key for instant download
      if (typeof window !== 'undefined') {
        const base64 = btoa(String.fromCharCode.apply(null, Array.from(pdfBytes)));
        sessionStorage.setItem(`pdf_${v.id}`, base64);
      }
    } catch (pdfErr) {
      console.error('Error generating PDF:', pdfErr);
      return { success: false, message: 'Gagal membuat arsip PDF. Penerbitan dibatalkan.' };
    }

    invoice.status = 'Terbit';
    invoice.active_token = rawToken;
    invoice.updated_at = new Date().toISOString();

    this.save(STORAGE_KEYS.INVOICES, this.invoices);
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

    const now = new Date().toISOString();
    const newInvoiceId = 'inv-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const newVersionId = 'ver-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    // Copy item description and unit ONLY. Empty qty and price.
    const duplicatedItems: InvoiceItem[] = original.current_version.items.map((item, idx) => ({
      id: 'item-' + idx + '-' + Date.now().toString(36),
      sort_order: idx + 1,
      description: item.description,
      quantity: 0,
      unit: item.unit || '',
      unit_price: 0,
      total: 0,
    }));

    const newVersion: InvoiceVersion = {
      id: newVersionId,
      invoice_id: newInvoiceId,
      version_number: 1,
      issue_date: '', // Empty as specified
      due_date: '', // Empty as specified
      period: '', // Empty as specified
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
      subtotal: 0,
      discount_type: 'percent',
      discount_value: 0,
      discount_amount: 0,
      tax_enabled: false,
      tax_rate: 0,
      tax_amount: 0,
      grand_total: 0,
      terbilang: 'Nol Rupiah',
      client_notes: this.settings.default_client_notes,
      work_terms: this.settings.default_work_terms,
      payment_terms: this.settings.default_payment_terms,
      created_at: now,
    };

    const newInvoice: Invoice = {
      id: newInvoiceId,
      revision_number: 1,
      status: 'Draft',
      payment_status: 'Belum Dibayar',
      client_id: client ? client.id : original.client_id,
      assigned_user_id: active.id,
      current_version: newVersion,
      payments: [],
      created_by_id: active.id,
      created_by_name: active.full_name,
      created_at: now,
      updated_at: now,
    };

    this.invoices.push(newInvoice);
    this.save(STORAGE_KEYS.INVOICES, this.invoices);
    this.recordAuditLog(
      'INVOICE',
      newInvoice.id,
      `Menduplikasi invoice ${original.invoice_number || original.id} menjadi draft baru untuk ${client ? client.company_name : clientSnapshot.company_name}`
    );

    return { success: true, message: 'Draft duplikasi berhasil dibuat.', invoice: newInvoice };
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
      invoice.payment_status = 'Lunas';
    } else {
      invoice.payment_status = 'Dibayar Sebagian';
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
      invoice.payment_status = 'Belum Dibayar';
    } else if (remainingValidPayments < invoice.current_version.grand_total) {
      invoice.payment_status = 'Dibayar Sebagian';
    } else {
      invoice.payment_status = 'Lunas';
    }

    invoice.updated_at = new Date().toISOString();
    this.save(STORAGE_KEYS.INVOICES, this.invoices);

    this.recordAuditLog('PAYMENT', invoice.id, `Membatalkan pembayaran ${payment.amount} dengan alasan: ${reason.trim()}`);
    return { success: true, message: 'Pembayaran berhasil dibatalkan (reversal dicatat).' };
  }

  // --- Public Recipient Access by 32-Byte Token ---
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
    if (!rawToken || rawToken.length < 32) {
      return { found: false };
    }

    const tokenHash = await hashToken(rawToken);
    const tokenInfo = this.tokensMap[tokenHash];

    if (!tokenInfo || !tokenInfo.isActive) {
      // Check if it exists on the invoice directly (for local dev convenience)
      const directInvoice = this.invoices.find((i) => i.active_token === rawToken);
      if (!directInvoice) {
        return { found: false };
      }
      if (directInvoice.status === 'Dibatalkan') {
        return { found: true, isCanceled: true, invoice: directInvoice };
      }
      if (directInvoice.status !== 'Terbit') {
        return { found: false };
      }

      const totalPaid = directInvoice.payments.filter((p) => !p.is_reversed).reduce((s, p) => s + p.amount, 0);
      const remainingBalance = Math.max(0, directInvoice.current_version.grand_total - totalPaid);

      return {
        found: true,
        isCanceled: false,
        invoice: directInvoice,
        paymentSummary: {
          totalPaid,
          remainingBalance,
          isLunas: remainingBalance === 0,
          payments: directInvoice.payments
            .filter((p) => !p.is_reversed)
            .map((p) => ({ date: p.payment_date, amount: p.amount, method: p.payment_method })),
        },
      };
    }

    const invoice = this.getInvoiceById(tokenInfo.invoiceId);
    if (!invoice) return { found: false };

    if (invoice.status === 'Dibatalkan') {
      return { found: true, isCanceled: true, invoice };
    }

    const totalPaid = invoice.payments.filter((p) => !p.is_reversed).reduce((s, p) => s + p.amount, 0);
    const remainingBalance = Math.max(0, invoice.current_version.grand_total - totalPaid);

    return {
      found: true,
      isCanceled: false,
      invoice,
      paymentSummary: {
        totalPaid,
        remainingBalance,
        isLunas: remainingBalance === 0,
        payments: invoice.payments
          .filter((p) => !p.is_reversed)
          .map((p) => ({ date: p.payment_date, amount: p.amount, method: p.payment_method })),
      },
    };
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

  private recordAuditLog(entityType: AuditLog['entity_type'], entityId: string, details: string) {
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

  public addUser(params: { email: string; fullName: string; role: UserRole }) {
    return this.inviteUser(params.email, params.fullName, params.role);
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
}

export const dataService = new DataService();
