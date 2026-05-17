const encoder = new TextEncoder()
const decoder = new TextDecoder()

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

async function deriveAesKey(masterKey: string): Promise<CryptoKey> {
  const normalizedKey = masterKey.trim()
  if (!normalizedKey) {
    throw new Error('OPERATOR_SECRETS_MASTER_KEY is not configured')
  }

  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(normalizedKey))
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function encryptOperatorSecret(
  plaintext: string,
  masterKey: string
): Promise<{ ciphertext: string; iv: string }> {
  const key = await deriveAesKey(masterKey)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext)
  )

  return {
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    iv: bytesToBase64(iv),
  }
}

export async function decryptOperatorSecret(
  ciphertext: string,
  iv: string,
  masterKey: string
): Promise<string> {
  const key = await deriveAesKey(masterKey)
  const ivBytes = base64ToBytes(iv)
  const ciphertextBytes = base64ToBytes(ciphertext)
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(ivBytes) },
    key,
    toArrayBuffer(ciphertextBytes)
  )

  return decoder.decode(decrypted).trim()
}
