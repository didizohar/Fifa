import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "../lib/i18n";
import { colors, radius, spacing, typography } from "../theme";

interface ScoreStepperProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  max?: number;
}

export function ScoreStepper({ label, value, onChange, max = 99 }: ScoreStepperProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <Pressable
          onPress={() => onChange(Math.max(0, value - 1))}
          style={styles.button}
          disabled={value <= 0}
          accessibilityRole="button"
          accessibilityLabel={t("common.decreaseLabel", { label })}
        >
          <Text style={[styles.buttonLabel, value <= 0 && styles.buttonLabelDisabled]}>–</Text>
        </Pressable>
        <Text style={styles.value} accessibilityLabel={t("common.valueLabel", { label, value: String(value) })}>{value}</Text>
        <Pressable
          onPress={() => onChange(Math.min(max, value + 1))}
          style={styles.button}
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

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: spacing.sm,
  },
  label: {
    ...typography.caption,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  button: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonLabel: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.accent,
  },
  buttonLabelDisabled: {
    color: colors.textMuted,
  },
  value: {
    ...typography.stat,
    minWidth: 44,
    textAlign: "center",
  },
});
