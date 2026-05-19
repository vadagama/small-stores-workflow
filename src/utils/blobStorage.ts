import type { Stage, ChangelogEntry } from '../types';

export interface BlobData {
  stages: Stage[];
  changelog: ChangelogEntry[];
  projectStart: string;
  _uploadedAt: string;
}

export async function fetchBlobData(): Promise<BlobData | null> {
  const res = await fetch('/api/blob');
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Blob API error: ${res.status}`);
  return res.json() as Promise<BlobData>;
}

export async function uploadBlobData(
  data: Pick<BlobData, 'stages' | 'changelog' | 'projectStart'>,
): Promise<void> {
  const res = await fetch('/api/blob', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Blob upload failed: ${res.status}`);
}
