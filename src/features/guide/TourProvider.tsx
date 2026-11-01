import { NavigationContainerRefWithCurrent } from '@react-navigation/native';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { BackHandler, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../../app/navigation/types';
import { allowed } from '../../services/session';
import { setSetting } from '../../services/settingsService';
import { scrim, spacing } from '../../theme/tokens';
import { useWrite } from '../data';
import { Btn, useColors } from '../ui';
import { getTarget } from './TourTarget';
import { BOTTOM_BAR, dimRects, placement, Rect, stepsFor, TourStep } from './tour';

interface TourApi {
  active: boolean;
  start: () => void;
}

const TourContext = createContext<TourApi>({ active: false, start: () => undefined });
export const useTour = () => useContext(TourContext);

type NavRef = NavigationContainerRefWithCurrent<RootStackParamList>;

function open(nav: NavRef, step: TourStep) {
  if (!nav.isReady()) {
    return;
  }
  if (step.screen) {
    nav.navigate(step.screen);
  } else if (step.tab) {
    nav.navigate('Tabs', { screen: step.tab });
  }
}

/**
 * The guided tour: walks through the steps, opening each screen and dimming
 * everything except the thing being explained. Built from the app's own views
 * (no extra library), so it works offline and in both themes.
 */
export function TourProvider({ navRef, children }: { navRef: NavRef; children: ReactNode }) {
  const write = useWrite();
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const active = steps.length > 0;
  const step = steps[index];

  const finish = useCallback(async () => {
    setSteps([]);
    setIndex(0);
    setRect(null);
    if (navRef.isReady()) {
      navRef.navigate('Tabs', { screen: 'Home' });
    }
    await write(d => setSetting(d, 'guide.seen', '1'));
  }, [write, navRef]);

  const start = useCallback(() => {
    setIndex(0);
    setSteps(stepsFor(allowed));
  }, []);

  useEffect(() => {
    if (!active) {
      return;
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      finish();
      return true;
    });
    return () => sub.remove();
  }, [active, finish]);

  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();

  // Open the step's screen, then find what to highlight (it may take a moment to appear).
  useEffect(() => {
    if (!step) {
      return;
    }
    open(navRef, step);
    setRect(null);
    let cancelled = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const measure = () => {
      if (cancelled || !step.target) {
        return;
      }
      if (step.target === BOTTOM_BAR) {
        const h = 64 + insets.bottom;
        setRect({ x: 0, y: win.height - h, w: win.width, h });
        return;
      }
      const node = getTarget(step.target);
      const retry = () => {
        if (++tries < 12) {
          timer = setTimeout(measure, 150);
        }
      };
      if (!node) {
        retry();
        return;
      }
      node.measureInWindow((x, y, w, h) => {
        if (cancelled) {
          return;
        }
        if (w > 0 && h > 0) {
          setRect({ x, y, w, h });
        } else {
          retry();
        }
      });
    };
    timer = setTimeout(measure, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [step, navRef, insets.bottom, win.height, win.width]);

  const api = useMemo(() => ({ active, start }), [active, start]);
  return (
    <TourContext.Provider value={api}>
      {children}
      {step && (
        <TourOverlay
          step={step}
          index={index}
          total={steps.length}
          rect={rect}
          win={{ w: win.width, h: win.height }}
          onBack={() => setIndex(i => Math.max(0, i - 1))}
          onNext={() => (index + 1 >= steps.length ? finish() : setIndex(i => i + 1))}
          onSkip={finish}
        />
      )}
    </TourContext.Provider>
  );
}

function TourOverlay(props: {
  step: TourStep;
  index: number;
  total: number;
  rect: Rect | null;
  win: { w: number; h: number };
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const c = useColors();
  const { step, index, total, rect, win } = props;
  const last = index + 1 >= total;
  const place = placement(rect, win);
  const where =
    place.anchor === 'center'
      ? styles.center
      : place.anchor === 'top'
      ? { top: place.offset }
      : { bottom: place.offset };

  return (
    <View style={styles.fill} testID="tour-overlay" pointerEvents="box-none">
      {dimRects(rect, win).map((r, i) => (
        // A touch on the dimmed area does nothing, so the app underneath cannot be used mid-tour.
        <View key={i} onStartShouldSetResponder={() => true} style={[styles.dim, { left: r.x, top: r.y, width: r.w, height: r.h }]} />
      ))}
      {rect && (
        <View
          pointerEvents="none"
          style={[styles.ring, { borderColor: c.accent, left: rect.x - 6, top: rect.y - 6, width: rect.w + 12, height: rect.h + 12 }]}
        />
      )}
      <View style={[styles.card, where, { backgroundColor: c.surface, borderColor: c.outline }]}>
        <Text testID="tour-progress" style={{ color: c.textSecondary }}>{`Step ${index + 1} of ${total}`}</Text>
        <Text testID="tour-title" variant="titleMedium" accessibilityRole="header">
          {step.title}
        </Text>
        <Text testID="tour-body">{step.body}</Text>
        <View style={styles.buttons}>
          <Btn testID="tour-skip" textColor={c.textSecondary} onPress={props.onSkip}>
            {last ? 'Close' : 'Skip tour'}
          </Btn>
          {index > 0 && (
            <Btn testID="tour-back" onPress={props.onBack}>
              Back
            </Btn>
          )}
          <Btn testID="tour-next" mode="contained" onPress={props.onNext}>
            {last ? 'Done' : 'Next'}
          </Btn>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFill, zIndex: 1000, elevation: 1000 },
  dim: { position: 'absolute', backgroundColor: scrim },
  ring: { position: 'absolute', borderWidth: 3, borderRadius: spacing.sm },
  card: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: spacing.md,
    borderWidth: 1,
    elevation: 8,
  },
  center: { top: '30%' },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: spacing.sm },
});
