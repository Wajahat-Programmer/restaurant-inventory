import { act, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Animated, DeviceEventEmitter } from 'react-native';
import NativeTilt from '../../native/NativeTilt';
import { Photo25D } from './Photo25D';

let mockFocused = true;
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => mockFocused }));
jest.mock('../../native/NativeTilt', () => ({ __esModule: true, default: { start: jest.fn(), stop: jest.fn() } }));

const tilt = NativeTilt as unknown as { start: jest.Mock; stop: jest.Mock };
const reduceMotion = (on: boolean) =>
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(on);

beforeEach(() => {
  mockFocused = true;
  tilt.start.mockClear();
  tilt.stop.mockClear();
  jest.restoreAllMocks();
  reduceMotion(false);
});

const show = (over: Partial<Parameters<typeof Photo25D>[0]> = {}) =>
  render(<Photo25D path="/p/orig.jpg" cutoutPath="/p/cut.png" size={160} enabled testID="photo" {...over} />);

describe('Photo25D', () => {
  it('shows the cut-out over a soft shadow in the same shape, and listens to the phone', async () => {
    await show();
    await act(async () => undefined); // the phone says motion is fine
    expect(screen.getByTestId('photo25d-cutout').props.source).toEqual({ uri: 'file:///p/cut.png' });
    const shadow = screen.getByTestId('photo25d-shadow', { hidden: true });
    expect(shadow.props.source).toEqual({ uri: 'file:///p/cut.png' });
    expect(shadow.props.tintColor).toBe('black');
    expect(shadow.props.blurRadius).toBeGreaterThan(0);
    expect(tilt.start).toHaveBeenCalledTimes(1);
  });

  it('moves when the phone is leaned, and stops listening when it goes away', async () => {
    const timing = jest.spyOn(Animated, 'timing');
    const view = await show();
    await act(async () => undefined);
    // Held still for a moment, then leaned to the right.
    await act(async () => {
      for (let i = 0; i < 20; i++) {
        DeviceEventEmitter.emit('tilt', { ax: 0, ay: 9.8, az: 0 });
      }
      for (let i = 0; i < 6; i++) {
        DeviceEventEmitter.emit('tilt', { ax: 4, ay: 9, az: 0 });
      }
    });
    const lastX = timing.mock.calls.filter((_, i) => i % 2 === 0).pop()![1].toValue as number;
    expect(lastX).toBeGreaterThan(0.2);
    expect(timing.mock.calls.every(c => c[1].useNativeDriver === true)).toBe(true);
    await view.unmount();
    expect(tilt.stop).toHaveBeenCalledTimes(1);
    const callsAfter = timing.mock.calls.length;
    DeviceEventEmitter.emit('tilt', { ax: 9, ay: 0, az: 0 });
    expect(timing.mock.calls.length).toBe(callsAfter); // nobody is listening any more
  });

  it('is the plain picture when there is no cut-out', async () => {
    await show({ cutoutPath: null });
    expect(screen.queryByTestId('photo25d-cutout')).toBeNull();
    expect(tilt.start).not.toHaveBeenCalled();
  });

  it('is the plain picture when the switch is off', async () => {
    await show({ enabled: false });
    expect(screen.queryByTestId('photo25d-cutout')).toBeNull();
    expect(tilt.start).not.toHaveBeenCalled();
  });

  it('keeps the look but holds still when the phone is set to reduce motion', async () => {
    reduceMotion(true);
    await show();
    await act(async () => undefined);
    expect(screen.getByTestId('photo25d-cutout')).toBeTruthy();
    expect(tilt.start).not.toHaveBeenCalled();
  });

  it('holds still while another screen is on top', async () => {
    mockFocused = false;
    await show();
    expect(screen.getByTestId('photo25d-cutout')).toBeTruthy();
    expect(tilt.start).not.toHaveBeenCalled();
  });
});
