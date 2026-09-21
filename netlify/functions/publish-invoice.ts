import { Handler } from '@netlify/functions';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const ROMAN_MONTHS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const authHeader = event.headers.authorization;
  if (!authHeader) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Otorisasi diperlukan' }),
    };
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      statusCode: 503,
      body: JSON.stringify({ error: 'Kredensial database Supabase belum terkonfigurasi di server' }),
    };
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Verify JWT user
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Token autentikasi tidak valid' }),
    };
  }

  // Check role in profiles
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single();

  if (!profile || (profile.role !== 'OWNER' && profile.role !== 'ADMIN')) {
    return {
      statusCode: 403,
      body: JSON.stringify({ error: 'Hanya OWNER atau ADMIN yang berwenang menerbitkan invoice' }),
    };
  }

  let body: any = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { invoiceId } = body;
  if (!invoiceId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'invoiceId diperlukan' }) };
  }

  // Retrieve current sequence counter
  const { data: settings } = await supabase
    .from('app_settings')
    .select('invoice_sequence_counter')
    .eq('id', 1)
    .single();

  const nextSeq = settings?.invoice_sequence_counter || 1;

  // Format: INV/DIGITAL/{BULAN_ROMAWI}/{TAHUN_2_DIGIT}-{URUTAN_4_DIGIT}
  const now = new Date();
  const romanMonth = ROMAN_MONTHS[now.getMonth()];
  const year2Digit = now.getFullYear().toString().slice(-2);
  const seq4Digit = nextSeq.toString().padStart(4, '0');
  const invoiceNumber = `INV/DIGITAL/${romanMonth}/${year2Digit}-${seq4Digit}`;

  // Generate 32-byte raw token and SHA-256 hash
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  // Update invoice
  const { data: updatedInvoice, error: updateError } = await supabase
    .from('invoices')
    .update({
      invoice_number: invoiceNumber,
      status: 'Terbit',
      approved_by: user.id,
      approved_by_name: profile.full_name,
      approved_at: new Date().toISOString(),
      active_token_hash: tokenHash,
      token_revoked: false,
    })
    .eq('id', invoiceId)
    .select()
    .single();

  if (updateError) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Gagal memperbarui invoice', details: updateError.message }),
    };
  }

  // Increment counter
  await supabase
    .from('app_settings')
    .update({ invoice_sequence_counter: nextSeq + 1 })
    .eq('id', 1);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `Invoice ${invoiceNumber} berhasil diterbitkan`,
      invoice: updatedInvoice,
      rawToken, // Only returned once upon publication
    }),
  };
};
