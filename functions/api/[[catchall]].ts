// Cloudflare Pages Function: API handler for all /api/* routes

export async function onRequest(context: { request: Request; params: { catchall?: string[] } }) {
  const { request, params } = context;
  const url = new URL(request.url);
  const pathParts = params.catchall || [];
  const pathname = '/' + pathParts.join('/');

  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  // Health check
  if (pathname === '/health' || pathname === '') {
    return new Response(
      JSON.stringify({ status: 'ok', service: 'invoice-digital-cloudflare', timestamp: new Date().toISOString() }),
      { headers: corsHeaders }
    );
  }

  // Get Invoices list
  if (pathname === '/invoices') {
    return new Response(
      JSON.stringify({
        success: true,
        invoices: [],
        clients: [],
        tokens: {},
        settings: null,
      }),
      { headers: corsHeaders }
    );
  }

  // Public invoice lookup: /api/invoices/public/:token
  if (pathname.startsWith('/invoices/public/')) {
    const token = pathname.replace('/invoices/public/', '').trim();
    if (!token) {
      return new Response(
        JSON.stringify({ found: false, message: 'Token diperlukan.' }),
        { headers: corsHeaders, status: 400 }
      );
    }
    // Return not found from server so client falls back to localStorage/Supabase
    return new Response(
      JSON.stringify({ found: false, message: 'Dokumen diakses via penyimpanan lokal klien.' }),
      { headers: corsHeaders, status: 200 }
    );
  }

  // Invoices Sync endpoint: /api/invoices/sync
  if (pathname === '/invoices/sync') {
    if (request.method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}));
        return new Response(
          JSON.stringify({
            success: true,
            invoices: (body as any)?.invoices || [],
            tokens: (body as any)?.tokens || {},
            syncedAt: new Date().toISOString(),
          }),
          { headers: corsHeaders }
        );
      } catch {
        return new Response(
          JSON.stringify({ success: true, message: 'Sinkronisasi offline tersimpan.' }),
          { headers: corsHeaders }
        );
      }
    }
  }

  // Default fallback for any other /api/* request
  return new Response(
    JSON.stringify({ success: true, message: 'Cloudflare Pages API endpoint siap.' }),
    { headers: corsHeaders }
  );
}
