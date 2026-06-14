// client/src/utils/crypto.js

// Generate a random AES-GCM key
export const generateEncryptionKey = async () => {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  // Export key to raw format, then to Base64 to put in the URL
  const exported = await crypto.subtle.exportKey('raw', key);
  const exportedKeyBuffer = new Uint8Array(exported);
  return btoa(String.fromCharCode(...exportedKeyBuffer)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

// Import the Base64 key from the URL back into a CryptoKey object
export const importEncryptionKey = async (base64Key) => {
  // Pad the base64 string back to standard format
  let base64 = base64Key.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) { base64 += '='; }
  
  const rawKey = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'AES-GCM' },
    true,
    ['encrypt', 'decrypt']
  );
};

// Encrypt a chunk of data (prepends the 12-byte IV to the chunk so the receiver can decrypt it)
export const encryptChunk = async (key, arrayBuffer) => {
  const iv = crypto.getRandomValues(new Uint8Array(12)); // AES-GCM requires a 12-byte Initialization Vector
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    arrayBuffer
  );
  
  // Combine IV and Encrypted data into one buffer to send over WebRTC
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  return combined.buffer;
};

// Decrypt a chunk of data (extracts the IV from the first 12 bytes, then decrypts the rest)
export const decryptChunk = async (key, arrayBuffer) => {
  const data = new Uint8Array(arrayBuffer);
  const iv = data.slice(0, 12);
  const encryptedChunk = data.slice(12);
  
  return await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    encryptedChunk
  );
};