import { put, list, del } from '@vercel/blob';

const BLOB_PREFIX = 'project-state-';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-blob-token');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const token = req.headers['x-blob-token'];
  if (!token) {
    return res.status(401).json({ error: 'Missing x-blob-token header' });
  }

  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    try {
      const { blobs } = await list({ prefix: BLOB_PREFIX, token });
      if (blobs.length === 0) {
        return res.status(404).json({ error: 'No data' });
      }
      // Sort descending by uploadedAt — newest first
      const latest = blobs.sort(
        (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
      )[0];
      // New versioned URL is never CDN-cached — always fresh
      const response = await fetch(latest.url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`Blob fetch failed: ${response.status}`);
      const data = await response.json();
      return res.json(data);
    } catch (err) {
      console.error('Blob GET error:', err?.name, err?.message);
      return res.status(500).json({ error: err?.message ?? 'Failed to read' });
    }
  }

  if (req.method === 'POST') {
    try {
      const payload = {
        ...req.body,
        _uploadedAt: new Date().toISOString(),
      };

      // Use timestamp in pathname — each upload gets a unique URL, bypassing CDN cache
      const pathname = `${BLOB_PREFIX}${Date.now()}.json`;
      const result = await put(pathname, JSON.stringify(payload), {
        access: 'private',
        contentType: 'application/json',
        addRandomSuffix: false,
        token,
      });

      // Delete all previous versions
      const { blobs } = await list({ prefix: BLOB_PREFIX, token });
      const oldBlobs = blobs.filter(b => b.url !== result.url);
      if (oldBlobs.length > 0) {
        await del(oldBlobs.map(b => b.url), { token });
      }

      return res.json({ success: true, url: result.url, uploadedAt: payload._uploadedAt });
    } catch (err) {
      console.error('Blob POST error:', err?.name, err?.message);
      return res.status(500).json({ error: err?.message ?? 'Failed to upload' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
