import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, DeviceEventEmitter } from 'react-native';
import { stepTilt, TILT_START, TiltState } from '../../domain/tilt';
import NativeTilt from '../../native/NativeTilt';

/** Whether the person asked their phone to cut down on movement (Android: remove animations). Null until the phone has answered. */
export function useReduceMotion(): boolean | null {
  const [reduce, setReduce] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then(v => alive && setReduce(v), () => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

/**
 * The phone's lean as two animated values from -1 to 1 (x: left-right, y:
 * forward-back). The sensor runs only while `active` and the component is on
 * screen, so it costs no battery elsewhere.
 */
export function useTilt(active: boolean) {
  const x = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active || !NativeTilt) {
      return;
    }
    let state: TiltState = TILT_START;
    const sub = DeviceEventEmitter.addListener('tilt', (e: { ax: number; az: number }) => {
      state = stepTilt(state, e.ax, e.az);
      // Short eases between readings keep the movement smooth on the native thread.
      Animated.timing(x, { toValue: state.x, duration: 60, useNativeDriver: true }).start();
      Animated.timing(y, { toValue: state.y, duration: 60, useNativeDriver: true }).start();
    });
    NativeTilt.start();
    return () => {
      sub.remove();
      NativeTilt?.stop();
      x.setValue(0);
      y.setValue(0);
    };
  }, [active, x, y]);

  return { x, y };
}
