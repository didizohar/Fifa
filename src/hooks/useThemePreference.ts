import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "fc-rival:themePreference";

export type ThemePreference = "system" | "light" | "dark";

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

/**
 * Device-local (not per-group -- appearance is a personal, not a group,
 * setting), hydrate-on-mount / write-through AsyncStorage preference, same
 * shape as useNationalTeamsPreference. Defaults to "system" so a device
 * that never touches this setting follows the OS appearance exactly as it
 * already did before dark mode existed (see ThemeContext.tsx).
 */
export function useThemePreference() {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (cancelled || !isThemePreference(stored)) return;
        setPreferenceState(stored);
      })
      .finally(() => {
        if (!cancelled) setIsHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  return { preference, isHydrated, setPreference };
}
