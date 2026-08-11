// Deliberately does NOT re-export ThemeProvider/useTheme (import those from
// "./ThemeContext" directly) -- ThemeContext pulls in useThemePreference,
// which pulls in AsyncStorage's real native module. Every one of the ~80
// components that import from this barrel for the plain colors/typography/
// spacing/shadows/motion tokens would otherwise transitively drag that in
// too, breaking any of their Jest tests that don't happen to mock
// AsyncStorage (most don't, since they never needed to before). Keeping
// this barrel AsyncStorage-free is what keeps every unmigrated component's
// existing tests passing unchanged.
export { colors, lightColors, darkColors, type ThemeColors } from "./colors";
export { typography, createTypography } from "./typography";
export { spacing, radius, iconSize } from "./spacing";
export { shadows, createShadows } from "./shadows";
export { motion } from "./motion";
