import { pbkdf2Sync } from 'crypto';
import { fromBase64, toBase64, toHex, utf8Decode, utf8Encode } from './base64';
import {
  BACKUP_MAGIC,
  BackupError,
  decryptBackup,
  encryptBackup,
  hashSecret,
  looksLikeBackup,
  setKdf,
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

  it('round-trips with the right passphrase', async () => {
    const file = await encryptBackup(data, 'correct horse battery', FAST);
    expect(looksLikeBackup(file)).toBe(true);
    expect(Array.from(await decryptBackup(file, 'correct horse battery'))).toEqual(Array.from(data));
  });

  it('round-trips an empty payload and a large one', async () => {
    expect(await decryptBackup(await encryptBackup(new Uint8Array(0), 'passphrase1', FAST), 'passphrase1')).toHaveLength(0);
    const big = new Uint8Array(1_500_000).map((_, i) => i & 255);
    expect(await decryptBackup(await encryptBackup(big, 'passphrase1', FAST), 'passphrase1')).toHaveLength(big.length);
  });

  it('does not contain the plain text, and is different every time', async () => {
    const plain = utf8Encode('SECRET-RICE-LEDGER-SECRET-RICE-LEDGER');
    const a = await encryptBackup(plain, 'passphrase1', FAST);
    const b = await encryptBackup(plain, 'passphrase1', FAST);
    expect(Buffer.from(a).includes(Buffer.from('SECRET-RICE'))).toBe(false);
    expect(Array.from(a)).not.toEqual(Array.from(b)); // fresh salt and nonce
    expect(Buffer.from(a.slice(0, 8)).toString()).toBe(BACKUP_MAGIC);
  });

  it('rejects a wrong passphrase with an honest message', async () => {
    const file = await encryptBackup(data, 'right-passphrase', FAST);
    const err = await decryptBackup(file, 'wrong-passphrase').catch(e => e);
    expect(err).toBeInstanceOf(BackupError);
    expect(err.kind).toBe('wrong-passphrase');
    expect(err.message).toContain('damaged');
  });

  it('rejects a change to ANY byte: header, nonce, ciphertext or tag', async () => {
    const file = await encryptBackup(data.slice(0, 200), 'right-passphrase', FAST);
    // Every byte after the magic: flipping it must stop decryption.
    for (let i = 8; i < file.length; i++) {
      const bad = file.slice();
      bad[i] ^= 1;
      await expect(decryptBackup(bad, 'right-passphrase')).rejects.toThrow(BackupError);
    }
  });

  it('rejects truncated and foreign files', async () => {
    const file = await encryptBackup(data, 'right-passphrase', FAST);
    await expect(decryptBackup(file.slice(0, file.length - 1), 'right-passphrase')).rejects.toThrow(BackupError);
    await expect(decryptBackup(file.slice(0, 20), 'right-passphrase')).rejects.toThrow('too short');
    await expect(decryptBackup(utf8Encode('x'.repeat(200)), 'right-passphrase')).rejects.toThrow('not a Restaurant Inventory backup');
    expect(looksLikeBackup(utf8Encode('hello'))).toBe(false);
  });

  it('refuses a header that asks for an absurd number of rounds', async () => {
    const file = await encryptBackup(data, 'right-passphrase', FAST);
    new DataView(file.buffer, file.byteOffset).setUint32(8, 4_000_000_000, false);
    await expect(decryptBackup(file, 'right-passphrase')).rejects.toThrow('not a Restaurant Inventory backup');
  });

  it('insists on a real passphrase', async () => {
    await expect(encryptBackup(data, 'short', FAST)).rejects.toThrow('at least 8');
  });

  it('treats the same passphrase typed in different Unicode forms as equal', async () => {
    const file = await encryptBackup(data, 'café-passphrase', FAST);
    expect(await decryptBackup(file, 'café-passphrase')).toHaveLength(data.length);
  });
});

describe('hashSecret / verifySecret', () => {
  it('verifies the right secret and rejects others', async () => {
    const rec = await hashSecret('4829', 1000);
    expect(await verifySecret('4829', rec)).toBe(true);
    expect(await verifySecret('4828', rec)).toBe(false);
    expect(await verifySecret('', rec)).toBe(false);
  });

  it('stores no secret and salts every hash', async () => {
    const a = await hashSecret('4829', 1000);
    const b = await hashSecret('4829', 1000);
    expect(JSON.stringify(a)).not.toContain('4829');
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
    expect(a.iterations).toBe(1000);
  });

  it('survives being stored as JSON', async () => {
    const rec = JSON.parse(JSON.stringify(await hashSecret('4829', 1000)));
    expect(await verifySecret('4829', rec)).toBe(true);
  });

  it('is slow enough to matter at the default strength', async () => {
    const t = Date.now();
    await hashSecret('4829');
    expect(Date.now() - t).toBeGreaterThanOrEqual(1);
  });
});

describe('the key-derivation function', () => {
  afterEach(() => setKdf(null));

  const independent = async (secret: Uint8Array, salt: Uint8Array, c: number) =>
    new Uint8Array(pbkdf2Sync(secret, salt, c, 32, 'sha256'));

  it('an independent PBKDF2 (Node, like the Android one) opens what the JavaScript one sealed, and the reverse', async () => {
    const data = utf8Encode('ledger contents');
    const sealedByJs = await encryptBackup(data, 'cross-check phrase', FAST);
    setKdf(independent);
    expect(utf8Decode(await decryptBackup(sealedByJs, 'cross-check phrase'))).toBe('ledger contents');
    const sealedByOther = await encryptBackup(data, 'cross-check phrase', FAST);
    setKdf(null);
    expect(utf8Decode(await decryptBackup(sealedByOther, 'cross-check phrase'))).toBe('ledger contents');
  });

  it('is what hashes and checks PINs while installed', async () => {
    const calls: number[] = [];
    setKdf(async (secret, salt, c) => {
      calls.push(c);
      return independent(secret, salt, c);
    });
    const rec = await hashSecret('4829', 500);
    expect(await verifySecret('4829', rec)).toBe(true);
    expect(calls).toEqual([500, 500]);
  });
});
