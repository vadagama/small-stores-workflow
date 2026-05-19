import { put, list, del } from '@vercel/blob';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const BLOB_PATHNAME = 'project-state.json';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    try {
      const { blobs } = await list({ prefix: BLOB_PATHNAME, limit: 1 });
      if (blobs.length === 0) {
        return res.status(404).json({ error: 'No data' });
      }
      const response = await fetch(blobs[0].url, {
        headers: { 'Cache-Control': 'no-store' },
      });
      if (!response.ok) throw new Error('Blob fetch failed');
      const data = await response.json();
      return res.json(data);
    } catch (err) {
      console.error('Blob GET error:', err);
      return res.status(500).json({ error: 'Failed to read from blob storage' });
    }
  }

  if (req.method === 'POST') {
    try {
      const body = req.body as Record<string, unknown>;
      const payload = {
        ...body,
        _uploadedAt: new Date().toISOString(),
      };

      // Delete existing blob to allow overwrite with same pathname
      const { blobs: existing } = await list({ prefix: BLOB_PATHNAME, limit: 1 });
      if (existing.length > 0) {
        await del(existing[0].url);
      }

      await put(BLOB_PATHNAME, JSON.stringify(payload), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
      });

      return res.json({ success: true, uploadedAt: payload._uploadedAt });
    } catch (err) {
      console.error('Blob POST error:', err);
      return res.status(500).json({ error: 'Failed to upload to blob storage' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
