function hexToBytes(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2)
    arr[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return arr;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function verifyPassword(input: string): Promise<boolean> {
  const salt = import.meta.env.VITE_SECRET_SALT as string | undefined;
  const storedHash = import.meta.env.VITE_SECRET_HASH as string | undefined;
  if (!salt || !storedHash) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(input),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(salt), iterations: 100_000 },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(bits)) === storedHash;
}
