import { fromBase64, toBase64, toHex, utf8Decode, utf8Encode } from './base64';
import {
  BACKUP_MAGIC,
  BackupError,
  decryptBackup,
  encryptBackup,
  hashSecret,
  looksLikeBackup,
  sha256Hex,
  verifySecret,
} from './crypto';

const FAST = { iterations: 1000 };

describe('base64 and text', () => {
  it('matches the platform encoder for every length', () => {
    for (let n = 0; n < 40; n++) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + n) & 255);
      const text = toBase64(bytes);
      expect(text).toBe(Buffer.from(bytes).toString('base64'));
      expect(Array.from(fromBase64(text))).toEqual(Array.from(bytes));
    }
  });

  it('ignores line breaks and refuses garbage', () => {
    expect(Array.from(fromBase64('AQID\nBA=='))).toEqual([1, 2, 3, 4]);
    for (const bad of ['abc', 'ab!d', 'A=AA', 'AAAA=AAA']) {
      expect(() => fromBase64(bad)).toThrow('Not valid base64');
    }
  });

  it('round-trips Urdu, accents and emoji through UTF-8 like the platform does', () => {
    for (const s of ['plain', 'چاول اور دال', 'café', 'rice 🍚 bowl', '']) {
      expect(Array.from(utf8Encode(s))).toEqual(Array.from(Buffer.from(s, 'utf8')));
      expect(utf8Decode(utf8Encode(s))).toBe(s);
    }
  });

  it('hex-encodes bytes', () => {
    expect(toHex(Uint8Array.from([0, 15, 16, 255]))).toBe('000f10ff');
  });
});

describe('sha256Hex', () => {
  it('matches the known test vector', () => {
    expect(sha256Hex(utf8Encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('encryptBackup / decryptBackup', () => {
  const data = Uint8Array.from({ length: 5000 }, (_, i) => (i * 31) & 255);

  it('round-trips with the right passphrase', () => {
    const file = encryptBackup(data, 'correct horse battery', FAST);
    expect(looksLikeBackup(file)).toBe(true);
    expect(Array.from(decryptBackup(file, 'correct horse battery'))).toEqual(Array.from(data));
  });

  it('round-trips an empty payload and a large one', () => {
    expect(decryptBackup(encryptBackup(new Uint8Array(0), 'passphrase1', FAST), 'passphrase1')).toHaveLength(0);
    const big = new Uint8Array(1_500_000).map((_, i) => i & 255);
    expect(decryptBackup(encryptBackup(big, 'passphrase1', FAST), 'passphrase1')).toHaveLength(big.length);
  });

  it('does not contain the plain text, and is different every time', () => {
    const plain = utf8Encode('SECRET-RICE-LEDGER-SECRET-RICE-LEDGER');
    const a = encryptBackup(plain, 'passphrase1', FAST);
    const b = encryptBackup(plain, 'passphrase1', FAST);
    expect(Buffer.from(a).includes(Buffer.from('SECRET-RICE'))).toBe(false);
    expect(Array.from(a)).not.toEqual(Array.from(b)); // fresh salt and nonce
    expect(Buffer.from(a.slice(0, 8)).toString()).toBe(BACKUP_MAGIC);
  });

  it('rejects a wrong passphrase with an honest message', () => {
    const file = encryptBackup(data, 'right-passphrase', FAST);
    expect.assertions(3);
    try {
      decryptBackup(file, 'wrong-passphrase');
    } catch (e) {
      expect(e).toBeInstanceOf(BackupError);
      expect((e as BackupError).kind).toBe('wrong-passphrase');
      expect((e as BackupError).message).toContain('damaged');
    }
  });

  it('rejects a change to ANY byte: header, nonce, ciphertext or tag', () => {
    const file = encryptBackup(data.slice(0, 200), 'right-passphrase', FAST);
    // Every byte after the magic: flipping it must stop decryption.
    for (let i = 8; i < file.length; i++) {
      const bad = file.slice();
      bad[i] ^= 1;
      expect(() => decryptBackup(bad, 'right-passphrase')).toThrow(BackupError);
    }
  });

  it('rejects truncated and foreign files', () => {
    const file = encryptBackup(data, 'right-passphrase', FAST);
    expect(() => decryptBackup(file.slice(0, file.length - 1), 'right-passphrase')).toThrow(BackupError);
    expect(() => decryptBackup(file.slice(0, 20), 'right-passphrase')).toThrow('too short');
    expect(() => decryptBackup(utf8Encode('x'.repeat(200)), 'right-passphrase')).toThrow('not a Restaurant Inventory backup');
    expect(looksLikeBackup(utf8Encode('hello'))).toBe(false);
  });

  it('refuses a header that asks for an absurd number of rounds', () => {
    const file = encryptBackup(data, 'right-passphrase', FAST);
    new DataView(file.buffer, file.byteOffset).setUint32(8, 4_000_000_000, false);
    expect(() => decryptBackup(file, 'right-passphrase')).toThrow('not a Restaurant Inventory backup');
  });

  it('insists on a real passphrase', () => {
    expect(() => encryptBackup(data, 'short', FAST)).toThrow('at least 8');
  });

  it('treats the same passphrase typed in different Unicode forms as equal', () => {
    const file = encryptBackup(data, 'café-passphrase', FAST);
    expect(decryptBackup(file, 'café-passphrase')).toHaveLength(data.length);
  });
});

describe('hashSecret / verifySecret', () => {
  it('verifies the right secret and rejects others', () => {
    const rec = hashSecret('4829', 1000);
    expect(verifySecret('4829', rec)).toBe(true);
    expect(verifySecret('4828', rec)).toBe(false);
    expect(verifySecret('', rec)).toBe(false);
  });

  it('stores no secret and salts every hash', () => {
    const a = hashSecret('4829', 1000);
    const b = hashSecret('4829', 1000);
    expect(JSON.stringify(a)).not.toContain('4829');
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
    expect(a.iterations).toBe(1000);
  });

  it('survives being stored as JSON', () => {
    const rec = JSON.parse(JSON.stringify(hashSecret('4829', 1000)));
    expect(verifySecret('4829', rec)).toBe(true);
  });

  it('is slow enough to matter at the default strength', () => {
    const t = Date.now();
    hashSecret('4829');
    expect(Date.now() - t).toBeGreaterThanOrEqual(1);
  });
});
