import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const ENVELOPE_PREFIX = 'enc:v1:';

let cachedKey: Buffer | null | undefined;

/**
 * Dérive une clé AES-256 stable à partir de APP_ENCRYPTION_KEY (hex/base64/texte).
 * Le hash SHA-256 garantit toujours 32 octets quel que soit le format fourni.
 */
function getKey(): Buffer | null {
  if (cachedKey !== undefined) return cachedKey;
  const secret = process.env.APP_ENCRYPTION_KEY?.trim();
  if (!secret) {
    cachedKey = null;
    return null;
  }
  cachedKey = createHash('sha256').update(secret).digest();
  return cachedKey;
}

export function isEncryptionConfigured(): boolean {
  return getKey() !== null;
}

/** Chiffre une chaîne. Retourne le texte tel quel si aucune clé n'est configurée (dev). */
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  if (!key) return plaintext;
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENVELOPE_PREFIX + Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

/** Déchiffre. Les valeurs sans préfixe d'enveloppe (données historiques en clair) sont renvoyées telles quelles. */
export function decryptSecret(stored: string): string {
  if (!stored.startsWith(ENVELOPE_PREFIX)) return stored;
  const key = getKey();
  if (!key) return stored;
  try {
    const raw = Buffer.from(stored.slice(ENVELOPE_PREFIX.length), 'base64');
    const iv = raw.subarray(0, IV_LENGTH);
    const tag = raw.subarray(IV_LENGTH, IV_LENGTH + 16);
    const ciphertext = raw.subarray(IV_LENGTH + 16);
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    return stored;
  }
}
