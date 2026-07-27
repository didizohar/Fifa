import { useCallback, useRef, useState } from "react";
import { AccessibilityInfo } from "react-native";

const SUSPENSE_MS = 550;

/**
 * Runs the brief "drawing..." suspense beat between computing a result and
 * revealing it. The result itself must already be computed before calling
 * `start` -- this hook only delays *showing* it, it never influences it.
 * Skippable via `skip`, and skips instantly when reduced-motion is on.
 */
export function useDrawSuspense() {
  const [isDrawing, setIsDrawing] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<(() => void) | null>(null);

  const clearPending = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const start = useCallback((reveal: () => void) => {
    clearPending();
    pendingRef.current = reveal;
    setIsDrawing(true);
    AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (!pendingRef.current) return;
      timeoutRef.current = setTimeout(
        () => {
          pendingRef.current?.();
          pendingRef.current = null;
          setIsDrawing(false);
        },
        reduceMotion ? 0 : SUSPENSE_MS,
      );
    });
  }, []);

  const skip = useCallback(() => {
    clearPending();
    pendingRef.current?.();
    pendingRef.current = null;
    setIsDrawing(false);
  }, []);

  return { isDrawing, start, skip };
}
