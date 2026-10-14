import { AttachmentCategory, InvoiceAttachment } from '../types';

const DB_NAME = 'InvoiceDigitalStorageDB';
const DB_VERSION = 1;
const STORE_NAME = 'invoice_attachments';

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.reject(new Error('IndexedDB tidak didukung pada lingkungan ini'));
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  return dbPromise;
}

// In-memory fallback if IndexedDB is blocked or disabled
const memoryStore = new Map<string, string | Blob>();

/**
 * Menyimpan data berkas lampiran ke IndexedDB
 */
export async function storeAttachmentPayload(
  attachmentId: string,
  payload: Blob | string
): Promise<void> {
  try {
    const db = await getDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put({
        id: attachmentId,
        data: payload,
        updatedAt: new Date().toISOString(),
      });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('IndexedDB unavailable or failed, using memory fallback:', err);
    memoryStore.set(attachmentId, payload);
  }
}

/**
 * Mengambil data berkas lampiran dari IndexedDB atau memory
 */
export async function getAttachmentPayload(
  attachmentId: string
): Promise<Blob | string | null> {
  try {
    const db = await getDB();
    return await new Promise<Blob | string | null>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(attachmentId);
      req.onsuccess = () => {
        if (req.result && req.result.data) {
          resolve(req.result.data);
        } else {
          resolve(memoryStore.get(attachmentId) || null);
        }
      };
      req.onerror = () => {
        resolve(memoryStore.get(attachmentId) || null);
      };
    });
  } catch {
    return memoryStore.get(attachmentId) || null;
  }
}

/**
 * Menghapus data berkas lampiran dari IndexedDB dan memory
 */
export async function deleteAttachmentPayload(attachmentId: string): Promise<void> {
  memoryStore.delete(attachmentId);
  try {
    const db = await getDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(attachmentId);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch {
    // Ignore error on deletion
  }
}

/**
 * Konversi File objek ke Base64 Data URL
 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Gagal membaca berkas lampiran'));
    reader.readAsDataURL(file);
  });
}

/**
 * Format ukuran berkas (Bytes, KB, MB)
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Label kategori dokumen lampiran
 */
export function getAttachmentCategoryLabel(category?: AttachmentCategory): string {
  switch (category) {
    case 'PO':
      return 'PO / Surat Pesanan';
    case 'BAST':
      return 'BAST / Serah Terima';
    case 'KONTRAK':
      return 'Kontrak / SPK';
    case 'BUKTI_KERJA':
      return 'Bukti Pekerjaan / Timesheet';
    case 'FAKTUR_PAJAK':
      return 'Faktur Pajak / Bukti Potong';
    case 'PENAWARAN':
      return 'Penawaran / Quotation';
    case 'LAINNYA':
    default:
      return 'Dokumen Pendukung';
  }
}

/**
 * Warna badge berdasarkan kategori
 */
export function getAttachmentCategoryColor(category?: AttachmentCategory): {
  bg: string;
  text: string;
  border: string;
} {
  switch (category) {
    case 'PO':
      return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' };
    case 'BAST':
      return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' };
    case 'KONTRAK':
      return { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' };
    case 'BUKTI_KERJA':
      return { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' };
    case 'FAKTUR_PAJAK':
      return { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' };
    case 'PENAWARAN':
      return { bg: 'bg-cyan-50', text: 'text-cyan-800', border: 'border-cyan-200' };
    case 'LAINNYA':
    default:
      return { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' };
  }
}

/**
 * Unduh dokumen lampiran ke komputer/perangkat
 */
export async function downloadAttachmentFile(att: InvoiceAttachment): Promise<void> {
  let url = att.data_url;

  if (!url) {
    const payload = await getAttachmentPayload(att.id);
    if (payload instanceof Blob) {
      url = URL.createObjectURL(payload);
    } else if (typeof payload === 'string') {
      url = payload;
    }
  }

  if (!url) {
    if (att.drive_web_link) {
      window.open(att.drive_web_link, '_blank');
      return;
    }
    throw new Error('Data berkas lampiran tidak ditemukan atau belum dimuat.');
  }

  const a = document.createElement('a');
  a.href = url;
  a.download = att.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  if (url.startsWith('blob:')) {
    setTimeout(() => URL.revokeObjectURL(url!), 10000);
  }
}
