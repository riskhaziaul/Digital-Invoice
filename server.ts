import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';

const PORT = 3000;
const DB_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DB_DIR, 'database.json');

// Ensure database directory and file exist
function getDb() {
  try {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error('Error reading database file:', err);
  }
  return {
    invoices: [],
    tokens: {},
    clients: [],
    settings: null,
    users: [],
    auditLogs: [],
  };
}

function saveDb(data: any) {
  try {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving database file:', err);
  }
}

async function startServer() {
  const app = express();

  // Middleware for CORS & body parsing
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(express.json({ limit: '25mb' }));

  // --- API Routes ---

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Get all invoices (for client sync)
  app.get('/api/invoices', (req, res) => {
    const db = getDb();
    res.json({
      success: true,
      invoices: db.invoices || [],
      clients: db.clients || [],
      tokens: db.tokens || {},
      settings: db.settings,
    });
  });

  // Public Recipient Lookup: /api/invoices/public/:token
  // Resolves token against active_token, tokens mapping, id, or invoice_number
  app.get('/api/invoices/public/:token', (req, res) => {
    const rawToken = req.params.token;
    if (!rawToken || !rawToken.trim()) {
      return res.status(400).json({ found: false, message: 'Token diperlukan.' });
    }

    const token = rawToken.trim();
    const db = getDb();
    const invoices = db.invoices || [];
    const tokens = db.tokens || {};

    let targetInvoice: any = null;

    // 1. Check if token matches active_token directly
    targetInvoice = invoices.find((i: any) => i.active_token === token);

    // 2. Check tokens mapping (token or tokenHash)
    if (!targetInvoice && tokens[token]) {
      const info = tokens[token];
      if (info && info.isActive !== false) {
        targetInvoice = invoices.find((i: any) => i.id === info.invoiceId);
      }
    }

    // 3. Check values in tokens mapping
    if (!targetInvoice) {
      for (const [key, val] of Object.entries(tokens)) {
        const info = val as any;
        if (info && (info.token === token || key === token) && info.isActive !== false) {
          targetInvoice = invoices.find((i: any) => i.id === info.invoiceId);
          if (targetInvoice) break;
        }
      }
    }

    // 4. Fallback: match by invoice id or invoice number if published/canceled
    if (!targetInvoice) {
      targetInvoice = invoices.find(
        (i: any) =>
          (i.id === token || i.invoice_number === token) &&
          (i.status === 'Terbit' || i.status === 'Dibatalkan')
      );
    }

    if (!targetInvoice) {
      return res.status(404).json({
        found: false,
        message: 'Tautan invoice tidak ditemukan, telah kadaluarsa, atau akses telah dicabut.',
      });
    }

    const isCanceled = targetInvoice.status === 'Dibatalkan';
    const payments = (targetInvoice.payments || []).filter((p: any) => !p.is_reversed);
    const totalPaid = payments.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);
    const grandTotal = Number(targetInvoice.current_version?.grand_total) || 0;
    const remainingBalance = Math.max(0, grandTotal - totalPaid);

    const canonicalPaymentStatus = targetInvoice.payment_status || (remainingBalance === 0 ? 'Sudah di bayar' : (totalPaid > 0 ? 'Dibayar sebagian' : 'Belum Bayar'));

    res.json({
      found: true,
      isCanceled,
      invoice: targetInvoice,
      paymentSummary: {
        totalPaid,
        remainingBalance,
        isLunas: remainingBalance === 0 || targetInvoice.payment_status === 'Sudah di bayar' || targetInvoice.payment_status === 'Lunas',
        paymentStatus: canonicalPaymentStatus,
        payments: payments.map((p: any) => ({
          date: p.payment_date,
          amount: p.amount,
          method: p.payment_method,
        })),
      },
    });
  });

  // Publish Invoice endpoint
  app.post('/api/invoices/publish', (req, res) => {
    try {
      const { invoice, token, tokenHash } = req.body;
      if (!invoice || !invoice.id) {
        return res.status(400).json({ success: false, message: 'Data invoice tidak lengkap.' });
      }

      const db = getDb();
      if (!db.invoices) db.invoices = [];
      if (!db.tokens) db.tokens = {};

      const existingIndex = db.invoices.findIndex((i: any) => i.id === invoice.id);
      if (existingIndex >= 0) {
        db.invoices[existingIndex] = invoice;
      } else {
        db.invoices.push(invoice);
      }

      if (token) {
        const tokenKey = tokenHash || token;
        db.tokens[tokenKey] = {
          invoiceId: invoice.id,
          token: token,
          versionId: invoice.current_version?.id,
          isActive: true,
          updated_at: new Date().toISOString(),
        };
        // Also register raw token for direct lookup
        db.tokens[token] = {
          invoiceId: invoice.id,
          token: token,
          versionId: invoice.current_version?.id,
          isActive: true,
          updated_at: new Date().toISOString(),
        };
      }

      saveDb(db);
      res.json({ success: true, message: 'Invoice berhasil disimpan ke server.', invoice });
    } catch (err: any) {
      console.error('Error publishing invoice on server:', err);
      res.status(500).json({ success: false, message: err?.message || 'Server error' });
    }
  });

  // Client data synchronization endpoint (bidirectional merge)
  app.post('/api/invoices/sync', (req, res) => {
    try {
      const { invoices = [], clients = [], tokens = {}, settings, users = [] } = req.body;
      const db = getDb();

      // Merge invoices
      const existingInvoices: any[] = db.invoices || [];
      const invoiceMap = new Map<string, any>();
      for (const inv of existingInvoices) {
        invoiceMap.set(inv.id, inv);
      }
      for (const inv of invoices) {
        if (!inv || !inv.id) continue;
        const current = invoiceMap.get(inv.id);
        if (!current) {
          invoiceMap.set(inv.id, inv);
        } else {
          // Keep the one with newer updated_at
          const currentUpdated = new Date(current.updated_at || 0).getTime();
          const incomingUpdated = new Date(inv.updated_at || 0).getTime();
          if (incomingUpdated >= currentUpdated) {
            invoiceMap.set(inv.id, inv);
          }
        }
      }
      db.invoices = Array.from(invoiceMap.values());

      // Merge clients
      const existingClients: any[] = db.clients || [];
      const clientMap = new Map<string, any>();
      for (const c of existingClients) clientMap.set(c.id, c);
      for (const c of clients) {
        if (!c || !c.id) continue;
        const current = clientMap.get(c.id);
        if (!current) {
          clientMap.set(c.id, c);
        } else {
          const cUp = new Date(current.updated_at || 0).getTime();
          const inUp = new Date(c.updated_at || 0).getTime();
          if (inUp >= cUp) clientMap.set(c.id, c);
        }
      }
      db.clients = Array.from(clientMap.values());

      // Merge tokens
      db.tokens = { ...(db.tokens || {}), ...(tokens || {}) };

      // Settings & users
      if (settings && Object.keys(settings).length > 0) {
        db.settings = settings;
      }
      if (users && users.length > 0) {
        db.users = users;
      }

      saveDb(db);
      res.json({
        success: true,
        count: db.invoices.length,
        invoices: db.invoices,
        clients: db.clients,
        tokens: db.tokens,
      });
    } catch (err: any) {
      console.error('Error syncing with server:', err);
      res.status(500).json({ success: false, message: err?.message || 'Sync error' });
    }
  });

  // Record payment endpoint
  app.post('/api/invoices/payment', (req, res) => {
    try {
      const { invoiceId, payment } = req.body;
      const db = getDb();
      const invoice = (db.invoices || []).find((i: any) => i.id === invoiceId);
      if (!invoice) {
        return res.status(404).json({ success: false, message: 'Invoice tidak ditemukan.' });
      }

      if (!invoice.payments) invoice.payments = [];
      invoice.payments.push(payment);

      const validPayments = invoice.payments.filter((p: any) => !p.is_reversed);
      const totalPaid = validPayments.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);
      const grandTotal = Number(invoice.current_version?.grand_total) || 0;

      if (totalPaid <= 0) {
        invoice.payment_status = 'Belum Dibayar';
      } else if (totalPaid < grandTotal) {
        invoice.payment_status = 'Dibayar Sebagian';
      } else {
        invoice.payment_status = 'Lunas';
      }

      invoice.updated_at = new Date().toISOString();
      saveDb(db);

      res.json({ success: true, invoice });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err?.message });
    }
  });

  // --- Vite Middleware / Static serving ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
