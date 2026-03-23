import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import { tokens } from '../theme/tokens';

export type TopPopupType = 'success' | 'error' | 'warning' | 'info';

export type TopPopupPayload = {
  type: TopPopupType;
  message: string;
  title?: string;
  durationMs?: number;
};

type QueuedPopup = TopPopupPayload & {
  id: number;
};

type TopPopupContextValue = {
  showTopPopup: (payload: TopPopupPayload) => void;
  dismissTopPopup: () => void;
};

const TopPopupContext = createContext<TopPopupContextValue | undefined>(undefined);

const ENTRY_DURATION_MS = 220;
const EXIT_DURATION_MS = 220;

function getDefaultDuration(type: TopPopupType): number {
  if (type === 'error' || type === 'warning') {
    return 4200;
  }

  return 2800;
}

function getPopupTopOffset(): number {
  if (Platform.OS === 'android') {
    return (StatusBar.currentHeight ?? 0) + 8;
  }

  if (Platform.OS === 'ios') {
    return 54;
  }

  return 12;
}

function getPopupPalette(type: TopPopupType): { backgroundColor: string; borderColor: string } {
  if (type === 'success') {
    return { backgroundColor: tokens.colors.success, borderColor: '#98D6B4' };
  }

  if (type === 'error') {
    return { backgroundColor: tokens.colors.danger, borderColor: '#EFA0A0' };
  }

  if (type === 'warning') {
    return { backgroundColor: tokens.colors.warning, borderColor: '#F3D38A' };
  }

  return { backgroundColor: tokens.colors.accentDeep, borderColor: tokens.colors.borderStrong };
}

export function TopPopupProvider({ children }: { children: ReactNode }) {
  const [activePopup, setActivePopup] = useState<QueuedPopup | null>(null);
  const queueRef = useRef<QueuedPopup[]>([]);
  const nextIdRef = useRef(1);
  const activePopupRef = useRef<QueuedPopup | null>(null);
  const isAnimatingRef = useRef(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const translateYAnim = useRef(new Animated.Value(-80)).current;

  function clearHideTimer() {
    if (!hideTimerRef.current) {
      return;
    }

    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
  }

  const dismissTopPopup = useCallback(() => {
    if (!activePopupRef.current || isAnimatingRef.current) {
      return;
    }

    clearHideTimer();
    isAnimatingRef.current = true;

    Animated.parallel([
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: EXIT_DURATION_MS,
        useNativeDriver: true,
      }),
      Animated.timing(translateYAnim, {
        toValue: -80,
        duration: EXIT_DURATION_MS,
        useNativeDriver: true,
      }),
    ]).start(() => {
      isAnimatingRef.current = false;
      activePopupRef.current = null;
      setActivePopup(null);
    });
  }, [opacityAnim, translateYAnim]);

  const showTopPopup = useCallback((payload: TopPopupPayload) => {
    const normalizedMessage = payload.message.trim();

    if (normalizedMessage.length === 0) {
      return;
    }

    queueRef.current.push({
      ...payload,
      message: normalizedMessage,
      id: nextIdRef.current++,
    });

    if (!activePopupRef.current && !isAnimatingRef.current) {
      const nextPopup = queueRef.current.shift();

      if (nextPopup) {
        activePopupRef.current = nextPopup;
        setActivePopup(nextPopup);
      }
    }
  }, []);

  useEffect(() => {
    activePopupRef.current = activePopup;
  }, [activePopup]);

  useEffect(() => {
    if (activePopup || isAnimatingRef.current) {
      return;
    }

    const nextPopup = queueRef.current.shift();

    if (!nextPopup) {
      return;
    }

    activePopupRef.current = nextPopup;
    setActivePopup(nextPopup);
  }, [activePopup]);

  useEffect(() => {
    if (!activePopup) {
      return;
    }

    clearHideTimer();
    isAnimatingRef.current = true;
    opacityAnim.setValue(0);
    translateYAnim.setValue(-80);

    Animated.parallel([
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: ENTRY_DURATION_MS,
        useNativeDriver: true,
      }),
      Animated.timing(translateYAnim, {
        toValue: 0,
        duration: ENTRY_DURATION_MS,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      isAnimatingRef.current = false;

      if (!finished || !activePopupRef.current) {
        return;
      }

      hideTimerRef.current = setTimeout(() => {
        dismissTopPopup();
      }, activePopup.durationMs ?? getDefaultDuration(activePopup.type));
    });

    return () => {
      clearHideTimer();
    };
  }, [activePopup, dismissTopPopup, opacityAnim, translateYAnim]);

  useEffect(() => {
    return () => {
      clearHideTimer();
    };
  }, []);

  const contextValue = useMemo<TopPopupContextValue>(
    () => ({
      showTopPopup,
      dismissTopPopup,
    }),
    [dismissTopPopup, showTopPopup],
  );

  const popupPalette = activePopup ? getPopupPalette(activePopup.type) : null;

  return (
    <TopPopupContext.Provider value={contextValue}>
      <View style={styles.root}>
        {children}
        <View pointerEvents="box-none" style={styles.overlay}>
          {activePopup ? (
            <Animated.View
              style={[
                styles.popupWrapper,
                {
                  top: getPopupTopOffset(),
                  opacity: opacityAnim,
                  transform: [{ translateY: translateYAnim }],
                },
              ]}
            >
              <Pressable
                style={[
                  styles.popupCard,
                  {
                    backgroundColor: popupPalette?.backgroundColor,
                    borderColor: popupPalette?.borderColor,
                  },
                ]}
                onPress={dismissTopPopup}
              >
                {activePopup.title ? (
                  <Text style={styles.popupTitle}>{activePopup.title}</Text>
                ) : null}
                <Text style={styles.popupMessage}>{activePopup.message}</Text>
              </Pressable>
            </Animated.View>
          ) : null}
        </View>
      </View>
    </TopPopupContext.Provider>
  );
}

export function useTopPopup(): TopPopupContextValue {
  const context = useContext(TopPopupContext);

  if (!context) {
    throw new Error('useTopPopup precisa ser usado dentro de TopPopupProvider.');
  }

  return context;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
  },
  popupWrapper: {
    position: 'absolute',
    left: 12,
    right: 12,
  },
  popupCard: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    shadowColor: tokens.colors.black,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  popupTitle: {
    color: tokens.colors.white,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  popupMessage: {
    color: tokens.colors.white,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
});
