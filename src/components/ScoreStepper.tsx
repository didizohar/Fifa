import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "../lib/i18n";
import { useTheme } from "../theme/ThemeContext";

interface ScoreStepperProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  max?: number;
  /** Which brand color the +/- buttons and value use -- "primary" (default, blue) for a single/Team-1 stepper, "accentOrange" for Team 2, matching the concept's two-tone scoreboard. */
  tone?: "primary" | "accentOrange";
}

export function ScoreStepper({ label, value, onChange, max = 99, tone = "primary" }: ScoreStepperProps) {
  const { t } = useTranslation();
  const { colors, radius, spacing, typography } = useTheme();
  const toneColor = tone === "accentOrange" ? colors.accentOrange : colors.accent;
  const styles = useMemo(
    () => ({
      container: { alignItems: "center" as const, gap: spacing.sm },
      label: { ...typography.caption },
      row: { flexDirection: "row" as const, alignItems: "center" as const, gap: spacing.lg },
      button: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: toneColor, alignItems: "center" as const, justifyContent: "center" as const },
      buttonPressed: { backgroundColor: colors.border },
      buttonLabel: { fontSize: 20, fontWeight: "700" as const, color: toneColor },
      buttonLabelDisabled: { color: colors.textMuted },
      value: { ...typography.stat, minWidth: 44, textAlign: "center" as const },
    }),
    [colors, radius, spacing, typography, toneColor],
  );

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <Pressable
          onPress={() => onChange(Math.max(0, value - 1))}
          style={({ pressed }) => [styles.button, pressed && value > 0 && styles.buttonPressed]}
          disabled={value <= 0}
          accessibilityRole="button"
          accessibilityLabel={t("common.decreaseLabel", { label })}
        >
          <Text style={[styles.buttonLabel, value <= 0 && styles.buttonLabelDisabled]}>–</Text>
        </Pressable>
        <Text style={styles.value} accessibilityLabel={t("common.valueLabel", { label, value: String(value) })}>{value}</Text>
        <Pressable
          onPress={() => onChange(Math.min(max, value + 1))}
          style={({ pressed }) => [styles.button, pressed && value < max && styles.buttonPressed]}
          disabled={value >= max}
          accessibilityRole="button"
          accessibilityLabel={t("common.increaseLabel", { label })}
        >
          <Text style={[styles.buttonLabel, value >= max && styles.buttonLabelDisabled]}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}
