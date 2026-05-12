window.CryptoUtil = (function() {
  const ALGORITHM = 'AES-GCM';
  const KEY_LENGTH = 256;
  const PBKDF2_ITERATIONS = 100000;
  const SALT_LENGTH = 16;
  const IV_LENGTH = 12;

  async function deriveKey(password, salt) {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: ALGORITHM, length: KEY_LENGTH },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function encrypt(plaintext, password) {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const key = await deriveKey(password, salt);
    const encoder = new TextEncoder();
    const encrypted = await crypto.subtle.encrypt(
      { name: ALGORITHM, iv: iv },
      key,
      encoder.encode(plaintext)
    );
    return {
      salt: Array.from(new Uint8Array(salt)),
      iv: Array.from(new Uint8Array(iv)),
      ciphertext: Array.from(new Uint8Array(encrypted))
    };
  }

  async function decrypt(encryptedData, password) {
    const salt = new Uint8Array(encryptedData.salt);
    const iv = new Uint8Array(encryptedData.iv);
    const ciphertext = new Uint8Array(encryptedData.ciphertext);
    const key = await deriveKey(password, salt);
    const decrypted = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv: iv },
      key,
      ciphertext
    );
    return new TextDecoder().decode(decrypted);
  }

  return { encrypt, decrypt };
})();