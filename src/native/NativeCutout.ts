import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/**
 * Thin wrapper over ML Kit Subject Segmentation (beta API: keep this surface
 * small so a future interface change touches one file).
 */
export interface Spec extends TurboModule {
  /**
   * Starts the on-device model download if Google Play services does not have
   * it yet. Resolves true when the model is ready to use.
   */
  prepare(): Promise<boolean>;

  /**
   * Writes a transparent PNG of the main subject, cropped to its bounds.
   * Paths are plain file paths (no file:// prefix). Rejects when the model is
   * unavailable or finds no subject.
   */
  removeBackground(
    inputPath: string,
    outputPath: string,
  ): Promise<{ width: number; height: number }>;
}

/** Null when the native module is absent (Jest, or a build without it). */
export default TurboModuleRegistry.get<Spec>('NativeCutout');
