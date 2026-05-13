// encryptionKey.js – Obfuscated key derivation for public profile encryption
(function() {
  // The "secret" is assembled from parts, reversed, and XORed with a mask.
  // This makes it harder to find by simply searching the source.
  const parts = [
    "7b3e4a2f", "c8d1e5f9", "a4b6c8d0", "f1e2d3c4",
    "9a8b7c6d", "5e6f7a8b", "2c3d4e5f", "6a7b8c9d"
  ];
  const mask = 0x5A; // Arbitrary XOR mask

  // Reverse and XOR each part to reconstruct the raw seed
  let rawSeed = "";
  for (let part of parts) {
    let reversed = part.split('').reverse().join('');
    let xored = "";
    for (let i = 0; i < reversed.length; i++) {
      let charCode = reversed.charCodeAt(i) ^ mask;
      xored += String.fromCharCode(charCode);
    }
    rawSeed += xored;
  }

  // Fixed salt (also obfuscated)
  const saltHex = "a1b2c3d4e5f6071829a3b4c5d6e7f809";
  const salt = new Uint8Array(saltHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

  // Derive a CryptoKey using PBKDF2 (same as CryptoUtil uses)
  async function getPublicEncryptionKey() {
    const encoder = new TextEncoder();
    const seedBuffer = encoder.encode(rawSeed);
    const keyMaterial = await crypto.subtle.importKey(
      'raw', seedBuffer, 'PBKDF2', false, ['deriveKey']
    );
    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    return key;
  }

  // Store the key generator globally
  window.EncryptionKey = { getPublicEncryptionKey };
})();
