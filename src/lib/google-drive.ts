import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
} from 'firebase/auth';
import type { DriveFile, DriveUser } from '../types';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App singleton safely
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

// Google Drive Scopes requested and configured
export const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
];

const provider = new GoogleAuthProvider();
DRIVE_SCOPES.forEach((scope) => {
  provider.addScope(scope);
});
provider.setCustomParameters({
  prompt: 'consent',
  access_type: 'offline',
});

// Flag to indicate if we are in the middle of a sign-in flow
let isSigningIn = false;
// Cache the access token in memory ONLY (never in localStorage/sessionStorage)
let cachedAccessToken: string | null = null;

// Auth state listeners
type AuthCallback = (user: User | null, token: string | null) => void;
const listeners = new Set<AuthCallback>();

function notifyListeners(user: User | null, token: string | null) {
  listeners.forEach((cb) => {
    try {
      cb(user, token);
    } catch (e) {
      console.error('Error in auth listener:', e);
    }
  });
}

// Initialize auth state listener. Call this on app load.
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        notifyListeners(user, cachedAccessToken);
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        // Token expired or not available in memory; prompt sign-in when Drive action is initiated
        notifyListeners(user, null);
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      notifyListeners(null, null);
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const subscribeToDriveAuth = (callback: AuthCallback): (() => void) => {
  listeners.add(callback);
  callback(auth.currentUser, cachedAccessToken);
  return () => {
    listeners.delete(callback);
  };
};

// Must be called from a button click or user interaction
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Gagal mendapatkan token akses dari Google OAuth.');
    }

    cachedAccessToken = credential.accessToken;
    notifyListeners(result.user, cachedAccessToken);
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Sign in error:', error);
    if (error?.code === 'auth/popup-blocked') {
      throw new Error('Jendela popup Google diblokir oleh peramban. Silakan izinkan popup untuk situs ini lalu coba lagi.');
    }
    if (error?.code === 'auth/popup-closed-by-user') {
      throw new Error('Proses masuk Google dibatalkan oleh pengguna.');
    }
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logout = async () => {
  await signOut(auth);
  cachedAccessToken = null;
  notifyListeners(null, null);
};

// ==========================================
// Google Drive API Methods
// ==========================================

export async function ensureValidAccessToken(): Promise<string> {
  if (cachedAccessToken) {
    return cachedAccessToken;
  }
  // Try popup if token not in memory
  const signinResult = await googleSignIn();
  if (!signinResult?.accessToken) {
    throw new Error('Autentikasi Google Drive diperlukan untuk melanjutkan tindakan ini.');
  }
  return signinResult.accessToken;
}

export interface DriveAboutInfo {
  user: DriveUser;
  storageQuota?: {
    limit?: string;
    usage?: string;
    usageInDrive?: string;
  };
}

/**
 * Get current Google Drive user info and quota safely without triggering unexpected popups
 */
export async function getDriveAbout(): Promise<DriveAboutInfo | null> {
  const token = await getAccessToken();
  if (!token) return null;

  try {
    const res = await fetch(
      'https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress,photoLink),storageQuota',
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    return {
      user: data.user,
      storageQuota: data.storageQuota,
    };
  } catch (err) {
    console.warn('Failed to load drive about info:', err);
    return null;
  }
}

/**
 * Search or create target folder in Google Drive
 */
export async function getOrCreateFolder(folderName = 'Invoice Digital', parentFolderId?: string): Promise<string> {
  const token = await ensureValidAccessToken();

  let query = `mimeType = 'application/vnd.google-apps.folder' and name = '${folderName.replace(/'/g, "\\'")}' and trashed = false`;
  if (parentFolderId) {
    query += ` and '${parentFolderId}' in parents`;
  }

  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (searchRes.ok) {
    const searchData = await searchRes.json();
    if (searchData.files && searchData.files.length > 0) {
      return searchData.files[0].id;
    }
  }

  // Create folder if not found
  const metadata: any = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
    description: 'Folder arsip invoice resmi dari aplikasi Invoice Digital',
  };
  if (parentFolderId) {
    metadata.parents = [parentFolderId];
  }

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(metadata),
  });

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Gagal membuat folder di Google Drive');
  }

  const createdData = await createRes.json();
  return createdData.id;
}

/**
 * Helper to get clean Uint8Array from content (safely handling Buffer slices & Blobs)
 */
async function getRawBytes(content: Uint8Array | Blob): Promise<Uint8Array> {
  if (content instanceof Blob) {
    const arrayBuffer = await content.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }
  // If Uint8Array, construct clean array slice to ensure byteOffset & byteLength are accurate
  return new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
}

/**
 * Strategy 1: Two-Step Upload (Create JSON Metadata then PATCH Media Body)
 * Highly reliable across CORS and browser environments because it avoids fragile multipart boundaries
 */
async function uploadViaTwoStep(
  token: string,
  targetFolderId: string,
  params: { name: string; mimeType: string; content: Uint8Array | Blob; description?: string }
): Promise<DriveFile> {
  // Step 1: Create metadata entry
  const createRes = await fetch(
    'https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,webViewLink,webContentLink,createdTime,modifiedTime,size,iconLink,thumbnailLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: params.name,
        mimeType: params.mimeType,
        description: params.description || 'Disimpan secara otomatis dari Invoice Digital',
        parents: [targetFolderId],
      }),
    }
  );

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gagal membuat entri berkas di Drive (${createRes.status})`);
  }

  const fileData: DriveFile = await createRes.json();

  // Step 2: Upload media content to the created file
  try {
    const rawBytes = await getRawBytes(params.content);

    const patchRes = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileData.id}?uploadType=media&fields=id,name,mimeType,webViewLink,webContentLink,createdTime,modifiedTime,size,iconLink,thumbnailLink`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': params.mimeType,
        },
        body: new Blob([rawBytes as unknown as BlobPart], { type: params.mimeType }),
      }
    );

    if (!patchRes.ok) {
      const err = await patchRes.json().catch(() => ({}));
      throw new Error(err.error?.message || `Gagal mentransfer isi berkas ke Drive (${patchRes.status})`);
    }

    return await patchRes.json();
  } catch (uploadError) {
    // If media upload fails, clean up the empty zombie file
    try {
      await fetch(`https://www.googleapis.com/drive/v3/files/${fileData.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // Ignore cleanup error
    }
    throw uploadError;
  }
}

/**
 * Strategy 2: RFC 2387 Binary Multipart Upload
 * Uses exact binary assembly and explicit Content-Type header with boundary
 */
async function uploadViaMultipart(
  token: string,
  targetFolderId: string,
  params: { name: string; mimeType: string; content: Uint8Array | Blob; description?: string }
): Promise<DriveFile> {
  const boundary = 'InvoiceDigitalBoundary' + Date.now().toString(36) + Math.random().toString(36).substring(2);
  const metadata = {
    name: params.name,
    mimeType: params.mimeType,
    description: params.description || 'Disimpan secara otomatis dari Invoice Digital',
    parents: [targetFolderId],
  };

  const rawBytes = await getRawBytes(params.content);
  const prePart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${params.mimeType}\r\n\r\n`;
  const postPart = `\r\n--${boundary}--`;

  const preBytes = new TextEncoder().encode(prePart);
  const postBytes = new TextEncoder().encode(postPart);

  const combined = new Uint8Array(preBytes.length + rawBytes.length + postBytes.length);
  combined.set(preBytes, 0);
  combined.set(rawBytes, preBytes.length);
  combined.set(postBytes, preBytes.length + rawBytes.length);

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink,webContentLink,createdTime,modifiedTime,size,iconLink,thumbnailLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: new Blob([combined as unknown as BlobPart]),
    }
  );

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || `Gagal unggah multipart (${res.status})`);
  }

  return await res.json();
}

/**
 * Strategy 3: Resumable Upload Session
 */
async function uploadViaResumable(
  token: string,
  targetFolderId: string,
  params: { name: string; mimeType: string; content: Uint8Array | Blob; description?: string }
): Promise<DriveFile> {
  const rawBytes = await getRawBytes(params.content);

  const initRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,webViewLink,webContentLink,createdTime,modifiedTime,size,iconLink,thumbnailLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': params.mimeType,
        'X-Upload-Content-Length': String(rawBytes.length),
      },
      body: JSON.stringify({
        name: params.name,
        mimeType: params.mimeType,
        description: params.description || 'Disimpan secara otomatis dari Invoice Digital',
        parents: [targetFolderId],
      }),
    }
  );

  if (!initRes.ok) {
    const err = await initRes.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gagal inisialisasi sesi upload (${initRes.status})`);
  }

  const uploadUri = initRes.headers.get('Location');
  if (!uploadUri) {
    throw new Error('Header Location tidak tersedia untuk sesi resumable');
  }

  const putRes = await fetch(uploadUri, {
    method: 'PUT',
    headers: {
      'Content-Type': params.mimeType,
    },
    body: new Blob([rawBytes as unknown as BlobPart], { type: params.mimeType }),
  });

  if (!putRes.ok) {
    const err = await putRes.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gagal mengunggah data resumable (${putRes.status})`);
  }

  return await putRes.json();
}

/**
 * Upload PDF or file directly to Google Drive using resilient multi-strategy fallback
 */
export async function uploadFileToDrive(params: {
  name: string;
  mimeType: string;
  content: Uint8Array | Blob;
  folderId?: string;
  description?: string;
}): Promise<DriveFile> {
  const token = await ensureValidAccessToken();

  // If no folderId provided, resolve or create 'Invoice Digital'
  const targetFolderId = params.folderId || (await getOrCreateFolder('Invoice Digital'));

  // Try Strategy 1 (Two-Step Upload) first for maximum CORS & parsing compatibility
  try {
    return await uploadViaTwoStep(token, targetFolderId, params);
  } catch (err1: any) {
    console.warn('Two-Step upload failed, attempting Multipart upload fallback:', err1);
    // Try Strategy 2 (Binary Multipart)
    try {
      return await uploadViaMultipart(token, targetFolderId, params);
    } catch (err2: any) {
      console.warn('Multipart upload failed, attempting Resumable upload fallback:', err2);
      // Try Strategy 3 (Resumable)
      try {
        return await uploadViaResumable(token, targetFolderId, params);
      } catch (err3: any) {
        console.error('All Google Drive upload strategies failed:', { err1, err2, err3 });
        const errMsg =
          err1?.message || err2?.message || err3?.message || 'Gagal mengunggah berkas ke Google Drive.';
        throw new Error(errMsg);
      }
    }
  }
}

/**
 * List files saved in the Invoice Digital folder or specified folder
 */
export async function listDriveFiles(folderId?: string, searchWord?: string): Promise<DriveFile[]> {
  const token = await getAccessToken();
  if (!token) return [];

  const targetFolderId = folderId || (await getOrCreateFolder('Invoice Digital'));

  let query = `'${targetFolderId}' in parents and trashed = false`;
  if (searchWord && searchWord.trim()) {
    const cleanWord = searchWord.trim().replace(/'/g, "\\'");
    query += ` and name contains '${cleanWord}'`;
  }

  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    query
  )}&fields=files(id,name,mimeType,webViewLink,webContentLink,createdTime,modifiedTime,size,iconLink,thumbnailLink)&orderBy=createdTime desc&pageSize=100`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Gagal memuat daftar berkas dari Google Drive');
  }

  const data = await res.json();
  return data.files || [];
}

/**
 * Delete a file from Google Drive (Mandatory user confirmation should be handled by caller)
 */
export async function deleteDriveFile(fileId: string): Promise<boolean> {
  const token = await ensureValidAccessToken();
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Gagal menghapus berkas di Google Drive');
  }

  return true;
}
