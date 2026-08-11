import type { ComponentProps } from "react";
import { useMemo } from "react";
import { Text, ViewStyle } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { AnimatedNumber } from "./AnimatedNumber";
import { Card } from "./Card";

type CardVariant = ComponentProps<typeof Card>["variant"];

interface StatTileProps {
  label: string;
  value: number | string;
  style?: ViewStyle;
  variant?: CardVariant;
}

/** Compact metric card -- used in stat-tile rows on Home and the player profile. */
export function StatTile({ label, value, style, variant }: StatTileProps) {
  const { colors, typography } = useTheme();
  const styles = useMemo(
    () => ({
      tile: { flex: 1, alignItems: "center" as const },
      value: { ...typography.stat, fontSize: 22, color: colors.accent },
      label: { ...typography.small, marginTop: 2 },
    }),
    [colors, typography],
  );

  return (
    <Card compact variant={variant} style={[styles.tile, style]}>
      <AnimatedNumber value={value} style={styles.value} />
      <Text style={styles.label}>{label}</Text>
    </Card>
  );
}
