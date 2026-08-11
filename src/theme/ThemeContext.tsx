import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useColorScheme, type ColorSchemeName } from "react-native";
import { darkColors, lightColors, type ThemeColors } from "./colors";
import { createTypography } from "./typography";
import { createShadows } from "./shadows";
import { radius, spacing, iconSize } from "./spacing";
import { motion } from "./motion";
import { useThemePreference, type ThemePreference } from "../hooks/useThemePreference";

export type ColorScheme = "light" | "dark";

export interface ThemeValue {
  scheme: ColorScheme;
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
  colors: ThemeColors;
  typography: ReturnType<typeof createTypography>;
  shadows: ReturnType<typeof createShadows>;
  spacing: typeof spacing;
  radius: typeof radius;
  iconSize: typeof iconSize;
  motion: typeof motion;
}

const ThemeContext = createContext<ThemeValue | null>(null);

/**
 * Used by useTheme() when there's no ThemeProvider ancestor -- the real app
 * always has one (see app/_layout.tsx), so this path is exclusively a
 * testing/Storybook-style convenience: it lets every primitive component
 * that's been migrated to useTheme() stay drop-in-safe for the dozens of
 * existing component tests that render them without wrapping in a
 * provider, with no test-file changes required. Built directly from the
 * static light exports rather than useMemo/createTypography calls, so nothing
 * here ever touches useThemePreference/AsyncStorage.
 */
const FALLBACK_THEME: ThemeValue = {
  scheme: "light",
  preference: "system",
  setPreference: () => {},
  colors: lightColors,
  typography: createTypography(lightColors),
  shadows: createShadows(lightColors),
  spacing,
  radius,
  iconSize,
  motion,
};

/**
 * Resolves the actual scheme to render: "system" follows the OS
 * (useColorScheme()), "light"/"dark" is an explicit user override that wins
 * regardless of the OS setting. A null/undefined OS scheme (can happen
 * transiently, or on platforms that don't report one) falls back to light,
 * matching this app's behavior before dark mode existed.
 */
/** Exported for direct unit testing -- avoids needing to mock react-native's useColorScheme (a real native module under jest-expo) just to exercise this branching. Accepts null/undefined defensively in addition to the declared ColorSchemeName -- useColorScheme() has returned null historically on some platforms/RN versions even where the current .d.ts declares it non-nullable. */
export function resolveScheme(preference: ThemePreference, systemScheme: ColorSchemeName | null | undefined): ColorScheme {
  if (preference === "light" || preference === "dark") return preference;
  return systemScheme === "dark" ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const { preference, setPreference } = useThemePreference();
  const scheme = resolveScheme(preference, systemScheme);

  const value = useMemo<ThemeValue>(() => {
    const colors = scheme === "dark" ? darkColors : lightColors;
    return {
      scheme,
      preference,
      setPreference,
      colors,
      typography: createTypography(colors),
      shadows: createShadows(colors),
      spacing,
      radius,
      iconSize,
      motion,
    };
  }, [scheme, preference, setPreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Every migrated component reads the active theme through this instead of
 * the static colors/typography/shadows exports -- see those files' own
 * comments for why the static ones can never become theme-aware in place.
 * Falls back to FALLBACK_THEME (light) outside a ThemeProvider -- see that
 * constant's own comment for why this is a deliberate fallback, not a bug.
 */
export function useTheme(): ThemeValue {
  return useContext(ThemeContext) ?? FALLBACK_THEME;
}
