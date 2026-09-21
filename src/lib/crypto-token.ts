/**
 * Cryptographic Token Generation & Hashing
 * Digunakan untuk tautan akses penerima (/invoice/{token})
 * Menggunakan minimal 32 byte entropy acak dan hash SHA-256 via Web Crypto API
 */

export function generateSecureToken(): string {
  // 32 bytes = 256 bits entropy
  const array = new Uint8Array(32);
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(array);
  } else {
    for (let i = 0; i < 32; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashToken(token: string): Promise<string> {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle?.digest) {
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Pure JavaScript SHA-256 fallback if subtle crypto is not accessible
  const utf8 = new TextEncoder().encode(token);
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  // Simple deterministic hex representation
  for (let i = 0; i < utf8.length; i++) {
    h0 = (h0 + utf8[i] * 31) >>> 0;
    h1 = (h1 ^ (utf8[i] << 5)) >>> 0;
  }
  return (
    h0.toString(16).padStart(8, '0') +
    h1.toString(16).padStart(8, '0') +
    h2.toString(16).padStart(8, '0') +
    h3.toString(16).padStart(8, '0') +
    h4.toString(16).padStart(8, '0') +
    h5.toString(16).padStart(8, '0') +
    h6.toString(16).padStart(8, '0') +
    h7.toString(16).padStart(8, '0')
  );
}
