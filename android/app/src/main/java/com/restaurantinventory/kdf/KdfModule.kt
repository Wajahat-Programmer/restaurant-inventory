package com.restaurantinventory.kdf

import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.restaurantinventory.specs.NativeKdfSpec
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * PBKDF2-HMAC-SHA256, 32 bytes out, written on raw bytes so it matches the
 * JavaScript implementation exactly (no character-encoding step in between).
 * Runs off the JavaScript thread.
 */
class KdfModule(reactContext: ReactApplicationContext) : NativeKdfSpec(reactContext) {

  override fun getName() = NAME

  override fun pbkdf2Sha256(secretBase64: String, saltBase64: String, iterations: Double, promise: Promise) {
    Thread {
          try {
            val rounds = iterations.toInt()
            require(rounds in 1..1_000_000) { "bad iteration count" }
            var secret = Base64.decode(secretBase64, Base64.DEFAULT)
            // HMAC pads a short key with zeros, so one zero byte equals an empty key.
            if (secret.isEmpty()) secret = ByteArray(1)
            val salt = Base64.decode(saltBase64, Base64.DEFAULT)
            val mac = Mac.getInstance("HmacSHA256")
            mac.init(SecretKeySpec(secret, "HmacSHA256"))

            // One 32-byte block: U1 = HMAC(P, salt || INT(1)); T = U1 xor U2 xor ...
            mac.update(salt)
            mac.update(byteArrayOf(0, 0, 0, 1))
            var u = mac.doFinal()
            val t = u.copyOf()
            for (i in 2..rounds) {
              u = mac.doFinal(u)
              for (j in t.indices) t[j] = (t[j].toInt() xor u[j].toInt()).toByte()
            }
            promise.resolve(Base64.encodeToString(t, Base64.NO_WRAP))
          } catch (e: Exception) {
            promise.reject("E_KDF", e)
          }
        }
        .start()
  }

  companion object {
    const val NAME = "NativeKdf"
  }
}
