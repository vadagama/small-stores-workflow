import type { Stage, ChangelogEntry } from '../types';

const BLOB_TOKEN = import.meta.env.VITE_BLOB_TOKEN as string | undefined;
const API_URL = '/api/blob';

export interface BlobData {
  stages: Stage[];
  changelog: ChangelogEntry[];
  projectStart: string;
  _uploadedAt: string;
}

export async function fetchBlobData(): Promise<BlobData | null> {
  if (!BLOB_TOKEN) return null;

  const res = await fetch(API_URL, {
    headers: { 'x-blob-token': BLOB_TOKEN },
    cache: 'no-store',
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Blob fetch failed: ${res.status}`);
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return null;
  return res.json() as Promise<BlobData>;
}

export async function uploadBlobData(
  data: Pick<BlobData, 'stages' | 'changelog' | 'projectStart'>,
): Promise<void> {
  if (!BLOB_TOKEN) throw new Error('VITE_BLOB_TOKEN not configured');

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-blob-token': BLOB_TOKEN,
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? 'Upload failed');
  }
}
