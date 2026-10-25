import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/** Installed app version and the Android side of installing an update. */
export interface Spec extends TurboModule {
  getVersion(): Promise<{ name: string; code: number }>;

  /** Whether Android lets this app install packages (the "install unknown apps" switch). */
  canInstall(): Promise<boolean>;

  /** Opens the Android screen where the owner allows this app to install updates. */
  openInstallSettings(): Promise<void>;

  /**
   * Hands a downloaded APK to Android's installer. Only files inside the app's
   * own cache/updates folder are accepted.
   */
  installApk(path: string): Promise<void>;
}

/** Null when the native module is absent (Jest). */
export default TurboModuleRegistry.get<Spec>('NativeAppUpdate');
