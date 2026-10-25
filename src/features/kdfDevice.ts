import { fromBase64, toBase64 } from '../domain/base64';
import { jsKdf, setKdf } from '../domain/crypto';
import NativeKdf from '../native/NativeKdf';

/**
 * Hands PIN hashing and backup-key derivation to Android. If the native call
 * ever fails, the JavaScript version (identical result, just slow) takes over,
 * so a backup or a PIN check is never lost to it.
 */
export function installNativeKdf(): void {
  if (!NativeKdf) {
    return;
  }
  const native = NativeKdf;
  setKdf(async (secret, salt, iterations) => {
    try {
      return fromBase64(await native.pbkdf2Sha256(toBase64(secret), toBase64(salt), iterations));
    } catch {
      return jsKdf(secret, salt, iterations);
    }
  });
}
