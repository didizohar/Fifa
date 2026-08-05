import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../theme";

export type InfoBannerTone = "info" | "warning";

interface InfoBannerProps {
  message: string;
  tone?: InfoBannerTone;
}

const TONE_STYLE: Record<InfoBannerTone, { bg: string; border: string; icon: string }> = {
  info: { bg: colors.accentSubtle, border: colors.accent, icon: "ℹ️" },
  warning: { bg: colors.warningSubtle, border: colors.warning, icon: "⚠️" },
};

/** Small inline notice -- "not enough data yet", "this player is archived", etc. Never the only signal (icon + text, no color-only meaning). */
export function InfoBanner({ message, tone = "info" }: InfoBannerProps) {
  const { bg, border, icon } = TONE_STYLE[tone];
  return (
    <View style={[styles.container, { backgroundColor: bg, borderColor: border }]} accessibilityRole="text">
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  icon: {
    fontSize: 16,
  },
  message: {
    ...typography.caption,
    flex: 1,
  },
});
