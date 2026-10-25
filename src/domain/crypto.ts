import { gcm } from '@noble/ciphers/aes.js';
import { randomBytes } from '@noble/ciphers/utils.js';
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { toHex, utf8Encode } from './base64';

/**
 * Everything cryptographic goes through here, built on audited pure-JS
 * primitives (@noble). Hermes has no WebCrypto, so these run in plain JS:
 * fine for a backup file or a PIN, too slow for bulk work.
 */

export const BACKUP_MAGIC = 'RIMBAK01'; // 8 bytes: format name + version
const SALT_LEN = 16;
const NONCE_LEN = 12;
const HEADER_LEN = 8 + 4 + SALT_LEN; // magic + iterations + salt
const TAG_LEN = 16;
/** The smallest possible file: header, nonce and the tag of an empty payload. */
const MIN_LEN = HEADER_LEN + NONCE_LEN + TAG_LEN;
export const BACKUP_ITERATIONS = 100_000;
export const PIN_ITERATIONS = 10_000;

export type BackupErrorKind = 'not-a-backup' | 'too-short' | 'wrong-passphrase';

export class BackupError extends Error {
  constructor(public kind: BackupErrorKind, message: string) {
    super(message);
    this.name = 'BackupError';
  }
}

export function sha256Hex(bytes: Uint8Array): string {
  return toHex(sha256(bytes));
}

function deriveKey(secret: string, salt: Uint8Array, iterations: number): Uint8Array {
  return pbkdf2(sha256, utf8Encode(secret.normalize('NFKC')), salt, { c: iterations, dkLen: 32 });
}

/**
 * AES-256-GCM. The file header (format, iteration count, salt) is authenticated
 * too, so changing any byte of it makes decryption fail.
 *
 *   RIMBAK01 | iterations (4, big-endian) | salt (16) | nonce (12) | ciphertext + tag
 */
export function encryptBackup(
  plain: Uint8Array,
  passphrase: string,
  opts: { iterations?: number } = {},
): Uint8Array {
  if (passphrase.length < 8) {
    throw new RangeError('The passphrase must be at least 8 characters');
  }
  const iterations = opts.iterations ?? BACKUP_ITERATIONS;
  const salt = randomBytes(SALT_LEN);
  const nonce = randomBytes(NONCE_LEN);
  const header = new Uint8Array(HEADER_LEN);
  header.set(utf8Encode(BACKUP_MAGIC), 0);
  new DataView(header.buffer).setUint32(8, iterations, false);
  header.set(salt, 12);

  const sealed = gcm(deriveKey(passphrase, salt, iterations), nonce, header).encrypt(plain);
  const out = new Uint8Array(HEADER_LEN + NONCE_LEN + sealed.length);
  out.set(header, 0);
  out.set(nonce, HEADER_LEN);
  out.set(sealed, HEADER_LEN + NONCE_LEN);
  return out;
}

/** Whether these bytes start like one of our backups (cheap check before asking for a passphrase). */
export function looksLikeBackup(data: Uint8Array): boolean {
  const magic = utf8Encode(BACKUP_MAGIC);
  return data.length >= MIN_LEN && magic.every((b, i) => data[i] === b);
}

export function decryptBackup(data: Uint8Array, passphrase: string): Uint8Array {
  if (!looksLikeBackup(data)) {
    throw new BackupError(
      data.length < MIN_LEN ? 'too-short' : 'not-a-backup',
      data.length < MIN_LEN ? 'This file is too short to be a backup.' : 'This is not a Restaurant Inventory backup file.',
    );
  }
  const header = data.slice(0, HEADER_LEN);
  const iterations = new DataView(header.buffer, header.byteOffset).getUint32(8, false);
  // A tampered header could ask for billions of rounds and freeze the phone.
  if (iterations < 1 || iterations > 1_000_000) {
    throw new BackupError('not-a-backup', 'This is not a Restaurant Inventory backup file.');
  }
  const nonce = data.slice(HEADER_LEN, HEADER_LEN + NONCE_LEN);
  const sealed = data.slice(HEADER_LEN + NONCE_LEN);
  try {
    return gcm(deriveKey(passphrase, header.slice(12, HEADER_LEN), iterations), nonce, header).decrypt(sealed);
  } catch {
    // GCM cannot tell a wrong passphrase from a damaged file, and says so honestly.
    throw new BackupError('wrong-passphrase', 'Wrong passphrase, or the file is damaged.');
  }
}

export interface PinRecord {
  hash: string;
  salt: string;
  iterations: number;
}

/** Salted, slow hash of a PIN or recovery passphrase. Only this is ever stored. */
export function hashSecret(secret: string, iterations = PIN_ITERATIONS): PinRecord {
  const salt = randomBytes(SALT_LEN);
  return { hash: toHex(deriveKey(secret, salt, iterations)), salt: toHex(salt), iterations };
}

export function verifySecret(secret: string, rec: PinRecord): boolean {
  const salt = Uint8Array.from((rec.salt.match(/../g) ?? []).map(h => parseInt(h, 16)));
  const got = toHex(deriveKey(secret, salt, rec.iterations));
  // Compare every character so timing does not reveal how much matched.
  let diff = got.length ^ rec.hash.length;
  for (let i = 0; i < got.length; i++) {
    diff |= got.charCodeAt(i) ^ (rec.hash.charCodeAt(i) || 0);
  }
  return diff === 0;
}
