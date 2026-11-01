import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/**
 * Starts and stops the phone's accelerometer. Readings arrive as a device
 * event named "tilt" with { ax, ay, az } in metres per second squared.
 */
export interface Spec extends TurboModule {
  start(): void;
  stop(): void;
}

/** Null when the native module is absent (Jest). */
export default TurboModuleRegistry.get<Spec>('NativeTilt');
