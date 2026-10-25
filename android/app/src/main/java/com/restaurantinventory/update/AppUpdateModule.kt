package com.restaurantinventory.update

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.restaurantinventory.specs.NativeAppUpdateSpec
import java.io.File

/**
 * The Android half of in-app updates: which version is installed, and handing
 * a downloaded APK to the system installer. Downloading and checking the file
 * happen in JavaScript before this is called.
 */
class AppUpdateModule(reactContext: ReactApplicationContext) : NativeAppUpdateSpec(reactContext) {

  override fun getName() = NAME

  override fun getVersion(promise: Promise) {
    try {
      val info = reactApplicationContext.packageManager.getPackageInfo(reactApplicationContext.packageName, 0)
      val map = Arguments.createMap()
      map.putString("name", info.versionName ?: "0.0.0")
      map.putInt("code", if (Build.VERSION.SDK_INT >= 28) info.longVersionCode.toInt() else @Suppress("DEPRECATION") info.versionCode)
      promise.resolve(map)
    } catch (e: Exception) {
      promise.reject("E_VERSION", e)
    }
  }

  override fun canInstall(promise: Promise) {
    promise.resolve(
        Build.VERSION.SDK_INT < Build.VERSION_CODES.O ||
            reactApplicationContext.packageManager.canRequestPackageInstalls())
  }

  override fun openInstallSettings(promise: Promise) {
    try {
      val intent =
          Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${reactApplicationContext.packageName}"))
              .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactApplicationContext.startActivity(intent)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("E_SETTINGS", e)
    }
  }

  override fun installApk(path: String, promise: Promise) {
    try {
      val updates = File(reactApplicationContext.cacheDir, "updates").canonicalFile
      val file = File(path).canonicalFile
      // Never install a file from anywhere else, whatever JavaScript asks for.
      if (file.parentFile != updates || !file.isFile) {
        promise.reject("E_PATH", "Only a downloaded update can be installed")
        return
      }
      val uri =
          FileProvider.getUriForFile(
              reactApplicationContext, "${reactApplicationContext.packageName}.fileprovider", file)
      val intent =
          Intent(Intent.ACTION_VIEW)
              .setDataAndType(uri, "application/vnd.android.package-archive")
              .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
      reactApplicationContext.startActivity(intent)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("E_INSTALL", e)
    }
  }

  companion object {
    const val NAME = "NativeAppUpdate"
  }
}
