import { ReactNode, useCallback, useEffect, useRef } from 'react';
import { HostInstance, StyleProp, View, ViewStyle } from 'react-native';

const registry = new Map<string, HostInstance>();

/** The on-screen element registered under this id, if it is mounted. */
export function getTarget(id: string): HostInstance | null {
  return registry.get(id) ?? null;
}

/**
 * Wrap anything the guided tour should be able to point at. It adds no
 * visual change; the tour measures it to draw the highlight.
 */
export function TourTarget({ id, children, style }: { id: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const ref = useRef<HostInstance>(null);
  useEffect(() => {
    const node = ref.current;
    if (node) {
      registry.set(id, node);
    }
    return () => {
      if (registry.get(id) === node) {
        registry.delete(id);
      }
    };
  }, [id]);
  return (
    <View ref={ref} collapsable={false} style={style}>
      {children}
    </View>
  );
}

/** For components that take a ref themselves (such as a floating button): `ref={useTourTarget('id')}`. */
export function useTourTarget(id: string) {
  return useCallback(
    // `unknown`: the floating button's ref type is a component type in React Native's typings, but at runtime it is the host view.
    (node: unknown) => {
      if (node) {
        registry.set(id, node as HostInstance);
      } else {
        registry.delete(id);
      }
    },
    [id],
  );
}
