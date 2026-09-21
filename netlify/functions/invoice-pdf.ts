import { Handler } from '@netlify/functions';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const token = event.queryStringParameters?.token;
  if (!token) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Token diperlukan' }),
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

  // Find invoice with this active token hash
  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('*, invoice_versions(*)')
    .eq('active_token_hash', tokenHash)
    .eq('token_revoked', false)
    .single();

  if (error || !invoice) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: 'Invoice tidak ditemukan atau akses telah dicabut' }),
    };
  }

  if (invoice.status === 'Dibatalkan') {
    return {
      statusCode: 410,
      body: JSON.stringify({ error: 'Dokumen invoice telah dibatalkan oleh penerbit' }),
    };
  }

  const version = invoice.invoice_versions?.[0];
  if (!version) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Data versi invoice tidak ditemukan' }),
    };
  }

  // Generate PDF with pdf-lib
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  page.drawText(version.publisher_snapshot?.name || 'INVOICE DIGITAL', {
    x: 40,
    y: 800,
    size: 16,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });

  page.drawText(`INVOICE: ${invoice.invoice_number}`, {
    x: 40,
    y: 770,
    size: 12,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });

  page.drawText(`Kepada: ${version.client_snapshot?.company_name || '-'}`, {
    x: 40,
    y: 740,
    size: 10,
    font: fontRegular,
    color: rgb(0.2, 0.2, 0.2),
  });

  page.drawText(`Grand Total: Rp ${Number(version.grand_total || 0).toLocaleString('id-ID')}`, {
    x: 40,
    y: 710,
    size: 12,
    font: fontBold,
    color: rgb(0, 0, 0),
  });

  page.drawText(`Terbilang: "${version.terbilang || ''}"`, {
    x: 40,
    y: 690,
    size: 9,
    font: fontRegular,
    color: rgb(0.3, 0.3, 0.3),
  });

  const pdfBytes = await pdfDoc.save();

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="Invoice_${invoice.invoice_number}.pdf"`,
    },
    body: Buffer.from(pdfBytes).toString('base64'),
    isBase64Encoded: true,
  };
};
