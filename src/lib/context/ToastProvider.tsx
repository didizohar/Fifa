import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Animated, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Toast, ToastTone } from "../../components/Toast";
import { motion, spacing } from "../../theme";

interface ToastContextValue {
  showToast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VISIBLE_DURATION_MS = 2600;

/** Mounted once at the app root. Renders a single toast above everything else, including modals. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const progress = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (message: string, tone: ToastTone = "success") => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setToast({ message, tone });
      Animated.timing(progress, {
        toValue: 1,
        duration: motion.duration.entrance,
        easing: motion.easing.entrance,
        useNativeDriver: true,
      }).start();
      hideTimer.current = setTimeout(() => {
        Animated.timing(progress, {
          toValue: 0,
          duration: motion.duration.entrance,
          easing: motion.easing.entrance,
          useNativeDriver: true,
        }).start(() => setToast(null));
      }, VISIBLE_DURATION_MS);
    },
    [progress],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.wrapper,
            {
              top: insets.top + spacing.md,
              opacity: progress,
              transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }],
            },
          ]}
        >
          <Toast message={toast.message} tone={toast.tone} />
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    alignItems: "center",
  },
});
