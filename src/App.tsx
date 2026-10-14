import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { DashboardView } from './components/DashboardView';
import { InvoiceListView } from './components/InvoiceListView';
import { InvoiceFormView } from './components/InvoiceFormView';
import { InvoiceDetailView } from './components/InvoiceDetailView';
import { ClientManagementView } from './components/ClientManagementView';
import { PaymentManagementView } from './components/PaymentManagementView';
import { TemplateManagementView } from './components/TemplateManagementView';
import { UserManagementView } from './components/UserManagementView';
import { SettingsView } from './components/SettingsView';
import { AuditLogView } from './components/AuditLogView';
import { SetupGuideModal } from './components/SetupGuideModal';
import { RecipientInvoiceView } from './components/RecipientInvoiceView';
import { GoogleDriveView } from './components/GoogleDriveView';
import { LoginView } from './components/LoginView';
import { dataService } from './lib/data-service';
import { isSupabaseConfigured } from './lib/supabase';
import { Invoice, UserProfile } from './types';

export default function App() {
  // Check for public recipient route: /invoice/:token, #/invoice/:token, or ?token=:token
  const pathname = window.location.pathname;
  const hash = window.location.hash;
  const searchParams = new URLSearchParams(window.location.search);

  let recipientToken: string | null = null;
  const recipientMatch = pathname.match(/^\/invoice\/([a-zA-Z0-9_-]+)/);
  if (recipientMatch && recipientMatch[1] && recipientMatch[1] !== 'preview') {
    recipientToken = recipientMatch[1];
  } else if (hash) {
    const hashMatch = hash.match(/#\/?invoice\/([a-zA-Z0-9_-]+)/);
    if (hashMatch && hashMatch[1] && hashMatch[1] !== 'preview') {
      recipientToken = hashMatch[1];
    }
  }

  if (!recipientToken) {
    const qToken = searchParams.get('token') || searchParams.get('invoice');
    if (qToken && qToken !== 'preview') {
      recipientToken = qToken;
    }
  }

  if (recipientToken) {
    return <RecipientInvoiceView token={recipientToken} />;
  }

  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => dataService.isAuthenticated());

  // Internal App State
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [allUsers, setAllUsers] = useState<UserProfile[]>(dataService.getAllUsers());
  const [currentUser, setCurrentUser] = useState<UserProfile>(dataService.getCurrentUser());
  const [invoices, setInvoices] = useState<Invoice[]>(dataService.getInvoices());
  const [clients, setClients] = useState(dataService.getClients());

  // Views navigation
  const [viewMode, setViewMode] = useState<'list' | 'create' | 'edit' | 'detail'>('list');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | undefined>(undefined);

  // Setup Guide Modal
  const [showSetupGuide, setShowSetupGuide] = useState(false);

  // Refresh helper
  const handleRefreshData = () => {
    setInvoices([...dataService.getInvoices()]);
    setClients([...dataService.getClients()]);
    setAllUsers([...dataService.getAllUsers()]);
    setCurrentUser(dataService.getCurrentUser());
  };

  const handleLogout = () => {
    dataService.logout();
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return (
      <LoginView
        onLoginSuccess={(user) => {
          setIsAuthenticated(true);
          setCurrentUser(user);
          handleRefreshData();
        }}
      />
    );
  }

  const handleSwitchUser = (userId: string) => {
    dataService.switchActiveUser(userId);
    const updated = dataService.getCurrentUser();
    setCurrentUser(updated);

    // If active tab is not allowed for the new role, redirect to dashboard
    if (updated.role === 'VIEWER' && ['template', 'pengguna', 'pengaturan'].includes(activeTab)) {
      setActiveTab('dashboard');
    } else if (updated.role === 'STAFF' && ['pengguna', 'pengaturan'].includes(activeTab)) {
      setActiveTab('dashboard');
    } else if (updated.role === 'ADMIN' && activeTab === 'pengguna') {
      setActiveTab('dashboard');
    }
  };

  // Create new invoice
  const handleCreateNewInvoice = () => {
    setEditingInvoice(undefined);
    setViewMode('create');
    setActiveTab('invoice');
  };

  // Edit draft
  const handleEditDraft = (invoiceId: string) => {
    const inv = invoices.find((i) => i.id === invoiceId);
    if (inv) {
      setEditingInvoice(inv);
      setViewMode('edit');
      setActiveTab('invoice');
    }
  };

  // Duplicate invoice
  const handleDuplicate = (invoiceId: string) => {
    const res = dataService.duplicateInvoice(invoiceId);
    alert(res.message);
    if (res.success && res.invoice) {
      handleRefreshData();
      setEditingInvoice(res.invoice);
      setViewMode('edit');
      setActiveTab('invoice');
    }
  };

  // Select invoice for detail view
  const handleSelectInvoice = (invoiceId: string) => {
    setSelectedInvoiceId(invoiceId);
    setViewMode('detail');
    setActiveTab('invoice');
  };

  // Cancel invoice
  const handleCancelInvoice = (invoiceId: string, reason: string) => {
    const res = dataService.cancelInvoice(invoiceId, reason);
    alert(res.message);
    if (res.success) {
      handleRefreshData();
    }
  };

  // Selected invoice object
  const selectedInvoice = invoices.find((i) => i.id === selectedInvoiceId);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-800 antialiased">
      {/* Navigation Bar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab);
          if (tab === 'invoice') {
            setViewMode('list');
          }
        }}
        currentUser={currentUser}
        allUsers={allUsers}
        onSwitchUser={handleSwitchUser}
        onOpenSetupGuide={() => setShowSetupGuide(true)}
        isSupabaseConnected={isSupabaseConfigured()}
        onLogout={handleLogout}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {activeTab === 'dashboard' && (
          <DashboardView
            invoices={invoices}
            currentUser={currentUser}
            onCreateNewInvoice={handleCreateNewInvoice}
            onSelectInvoice={handleSelectInvoice}
          />
        )}

        {activeTab === 'invoice' && (
          <>
            {viewMode === 'list' && (
              <InvoiceListView
                invoices={invoices}
                currentUser={currentUser}
                onCreateInvoice={handleCreateNewInvoice}
                onSelectInvoice={handleSelectInvoice}
                onEditDraft={handleEditDraft}
                onDuplicate={handleDuplicate}
                onCancelInvoice={handleCancelInvoice}
                onRefresh={handleRefreshData}
              />
            )}

            {(viewMode === 'create' || viewMode === 'edit') && (
              <InvoiceFormView
                initialInvoice={editingInvoice}
                clients={clients}
                currentUser={currentUser}
                onBack={() => setViewMode('list')}
                onSaveSuccess={(invId) => {
                  handleRefreshData();
                  setSelectedInvoiceId(invId);
                  setViewMode('detail');
                }}
              />
            )}

            {viewMode === 'detail' && selectedInvoice && (
              <InvoiceDetailView
                invoice={selectedInvoice}
                currentUser={currentUser}
                onBack={() => setViewMode('list')}
                onEditDraft={handleEditDraft}
                onDuplicate={handleDuplicate}
                onRefresh={handleRefreshData}
              />
            )}
          </>
        )}

        {activeTab === 'drive' && (
          <GoogleDriveView
            currentUser={currentUser}
            invoices={invoices}
            onRefreshInvoices={handleRefreshData}
          />
        )}

        {activeTab === 'klien' && (
          <ClientManagementView
            clients={clients}
            currentUser={currentUser}
            allUsers={allUsers}
            onRefresh={handleRefreshData}
          />
        )}

        {activeTab === 'pembayaran' && (
          <PaymentManagementView
            invoices={invoices}
            currentUser={currentUser}
            onSelectInvoice={handleSelectInvoice}
            onRefresh={handleRefreshData}
          />
        )}

        {activeTab === 'template' && (
          <TemplateManagementView currentUser={currentUser} />
        )}

        {activeTab === 'pengguna' && (
          <UserManagementView
            currentUser={currentUser}
            allUsers={allUsers}
            onRefresh={handleRefreshData}
          />
        )}

        {activeTab === 'pengaturan' && (
          <SettingsView
            currentUser={currentUser}
            onRefresh={handleRefreshData}
          />
        )}

        {activeTab === 'riwayat' && (
          <AuditLogView currentUser={currentUser} />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 px-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="font-medium">
            Invoice Digital • Sistem Penagihan Resmi Digital & Marcomm Team
          </p>
          <div className="flex items-center gap-4 text-[11px]">
            <span>Rekening: blu by BCA Digital (000480500229)</span>
            <span>•</span>
            <button
              onClick={() => setShowSetupGuide(true)}
              className="text-slate-700 hover:text-slate-900 font-semibold underline"
            >
              Panduan Setup Netlify & Supabase
            </button>
          </div>
        </div>
      </footer>

      {/* Setup Guide Modal */}
      <SetupGuideModal
        isOpen={showSetupGuide}
        onClose={() => setShowSetupGuide(false)}
      />
    </div>
  );
}
