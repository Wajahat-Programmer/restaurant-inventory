package com.restaurantinventory.tilt

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.restaurantinventory.specs.NativeTiltSpec

/**
 * Feeds the phone's accelerometer to JavaScript (about 30 readings a second)
 * for the 2.5D item photo. It only listens between start() and stop().
 */
class TiltModule(reactContext: ReactApplicationContext) : NativeTiltSpec(reactContext), SensorEventListener {
  private var listening = false
  private var lastSent = 0L

  override fun getName() = NAME

  override fun start() {
    if (listening) return
    val manager = reactApplicationContext.getSystemService(Context.SENSOR_SERVICE) as? SensorManager ?: return
    val sensor = manager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) ?: return
    listening = manager.registerListener(this, sensor, SensorManager.SENSOR_DELAY_GAME)
  }

  override fun stop() {
    if (!listening) return
    (reactApplicationContext.getSystemService(Context.SENSOR_SERVICE) as? SensorManager)?.unregisterListener(this)
    listening = false
  }

  override fun onSensorChanged(event: SensorEvent) {
    val now = event.timestamp / 1_000_000 // ms
    if (now - lastSent < 33) return
    lastSent = now
    val map = Arguments.createMap()
    map.putDouble("ax", event.values[0].toDouble())
    map.putDouble("ay", event.values[1].toDouble())
    map.putDouble("az", event.values[2].toDouble())
    reactApplicationContext.emitDeviceEvent("tilt", map)
  }

  override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

  override fun invalidate() {
    stop()
    super.invalidate()
  }

  companion object {
    const val NAME = "NativeTilt"
  }
}
