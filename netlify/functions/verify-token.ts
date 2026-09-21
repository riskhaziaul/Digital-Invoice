import { Handler } from '@netlify/functions';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const token = event.queryStringParameters?.token;
  if (!token) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Token wajib diisi' }),
    };
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      statusCode: 503,
      body: JSON.stringify({ error: 'Supabase credentials not configured on server' }),
    };
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: invoice, error } = await supabase
    .from('invoices')
    .select(`
      id,
      invoice_number,
      status,
      payment_status,
      active_token_hash,
      token_revoked,
      pdf_storage_path,
      revision_number,
      created_at,
      invoice_versions(*),
      payments(id, amount, payment_date, payment_method, is_reversed)
    `)
    .eq('active_token_hash', tokenHash)
    .eq('token_revoked', false)
    .single();

  if (error || !invoice) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: 'Tautan invoice tidak ditemukan atau telah dicabut' }),
    };
  }

  // Safe client response - internal notes and profiles omitted
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      invoice,
    }),
  };
};
