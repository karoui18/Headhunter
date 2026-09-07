const encode = (v: Uint8Array) => btoa(Array.from(v, (c) => String.fromCharCode(c)).join(''));
const decode = (v: string) => Uint8Array.from(atob(v), (c) => c.charCodeAt(0));
async function key(password: string, salt: Uint8Array<ArrayBuffer>) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
export async function encryptBackup(json: string, password: string) {
  if (password.length < 10) throw new Error('Use at least 10 characters');
  const salt = crypto.getRandomValues(new Uint8Array(16)),
    iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await key(password, salt),
    new TextEncoder().encode(json),
  );
  return JSON.stringify({
    format: 'jobhunter-aes-gcm-v1',
    salt: encode(salt),
    iv: encode(iv),
    ciphertext: encode(new Uint8Array(ciphertext)),
  });
}
export async function decryptBackup(encrypted: string, password: string) {
  const v = JSON.parse(encrypted);
  if (
    v.format !== 'jobhunter-aes-gcm-v1' ||
    typeof v.salt !== 'string' ||
    typeof v.iv !== 'string' ||
    typeof v.ciphertext !== 'string'
  )
    throw new Error('Invalid encrypted backup');
  try {
    return new TextDecoder().decode(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: decode(v.iv) },
        await key(password, decode(v.salt)),
        decode(v.ciphertext),
      ),
    );
  } catch {
    throw new Error('Incorrect password or damaged backup');
  }
}
export function download(content: string, name: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
