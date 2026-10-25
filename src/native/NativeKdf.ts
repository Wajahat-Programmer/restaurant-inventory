import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/** PBKDF2-HMAC-SHA256 on Android's own crypto, so key derivation does not freeze the JavaScript thread. */
export interface Spec extends TurboModule {
  /** Base64 in, base64 out (32 bytes). Same result as the JavaScript version. */
  pbkdf2Sha256(secretBase64: string, saltBase64: string, iterations: number): Promise<string>;
}

/** Null when the native module is absent (Jest). */
export default TurboModuleRegistry.get<Spec>('NativeKdf');
