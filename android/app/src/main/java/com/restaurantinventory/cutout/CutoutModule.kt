package com.restaurantinventory.cutout

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.google.android.gms.common.moduleinstall.ModuleInstall
import com.google.android.gms.common.moduleinstall.ModuleInstallRequest
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentation
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenter
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenterOptions
import com.restaurantinventory.specs.NativeCutoutSpec
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.Executors

/**
 * Background removal for item photos, using ML Kit Subject Segmentation. The
 * model lives in Google Play services and is downloaded on demand, so the APK
 * does not grow. Everything runs on-device.
 */
class CutoutModule(reactContext: ReactApplicationContext) : NativeCutoutSpec(reactContext) {

  // Bitmap work must not run on the main thread.
  private val worker = Executors.newSingleThreadExecutor()

  private val segmenter: SubjectSegmenter by lazy {
    SubjectSegmentation.getClient(
        SubjectSegmenterOptions.Builder().enableForegroundBitmap().build())
  }

  override fun getName() = NAME

  override fun prepare(promise: Promise) {
    ModuleInstall.getClient(reactApplicationContext)
        .installModules(ModuleInstallRequest.newBuilder().addApi(segmenter).build())
        .addOnSuccessListener { promise.resolve(true) }
        .addOnFailureListener { promise.resolve(false) }
  }

  override fun removeBackground(inputPath: String, outputPath: String, promise: Promise) {
    worker.execute {
      try {
        val source =
            BitmapFactory.decodeFile(inputPath)
                ?: return@execute promise.reject("E_DECODE", "Could not read $inputPath")

        segmenter
            .process(InputImage.fromBitmap(source, 0))
            .addOnSuccessListener(worker) { result ->
              try {
                val foreground =
                    result.foregroundBitmap
                        ?: return@addOnSuccessListener promise.reject(
                            "E_NO_SUBJECT", "No subject found in the photo")
                val cropped =
                    cropToSubject(foreground)
                        ?: return@addOnSuccessListener promise.reject(
                            "E_NO_SUBJECT", "No subject found in the photo")
                FileOutputStream(File(outputPath)).use {
                  cropped.compress(Bitmap.CompressFormat.PNG, 100, it)
                }
                val map = Arguments.createMap()
                map.putInt("width", cropped.width)
                map.putInt("height", cropped.height)
                promise.resolve(map)
              } catch (e: Exception) {
                promise.reject("E_WRITE", e)
              }
            }
            .addOnFailureListener(worker) { e -> promise.reject("E_SEGMENT", e) }
      } catch (e: Exception) {
        promise.reject("E_DECODE", e)
      }
    }
  }

  /** Crops a transparent bitmap to the bounds of its visible pixels. */
  private fun cropToSubject(bmp: Bitmap): Bitmap? {
    val w = bmp.width
    val h = bmp.height
    val row = IntArray(w)
    var top = -1
    var bottom = -1
    var left = w
    var right = -1
    for (y in 0 until h) {
      bmp.getPixels(row, 0, w, 0, y, w, 1)
      var first = -1
      var last = -1
      for (x in 0 until w) {
        if ((row[x] ushr 24) > ALPHA_CUTOFF) {
          if (first < 0) first = x
          last = x
        }
      }
      if (first >= 0) {
        if (top < 0) top = y
        bottom = y
        if (first < left) left = first
        if (last > right) right = last
      }
    }
    if (top < 0) return null
    return Bitmap.createBitmap(bmp, left, top, right - left + 1, bottom - top + 1)
  }

  companion object {
    const val NAME = "NativeCutout"
    private const val ALPHA_CUTOFF = 16
  }
}
