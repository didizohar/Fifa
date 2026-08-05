import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { notify } from "../lib/confirm";
import { exportCsv } from "../lib/exportFile";
import { useTranslation } from "../lib/i18n";
import { colors, radius, spacing, typography } from "../theme";

interface ExportButtonProps {
  /** Required (no hardcoded English fallback) so every call site is forced to pass a translated label. */
  label: string;
  filename: string;
  /** Builds the CSV content lazily, only when the user actually taps export. */
  getCsv: () => string;
}

/** Small icon+label button that exports the given CSV via the native share sheet or a web download. */
export function ExportButton({ label, filename, getCsv }: ExportButtonProps) {
  const { t } = useTranslation();
  const [isExporting, setIsExporting] = useState(false);

  const handlePress = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      await exportCsv(filename, getCsv());
    } catch (e) {
      notify(t("common.exportCsvErrorTitle"), e instanceof Error ? e.message : t("playerProfile.genericRetryMessage"));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={isExporting}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, isExporting && styles.disabled]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {isExporting ? <ActivityIndicator size="small" color={colors.accent} /> : <Ionicons name="download-outline" size={16} color={colors.accent} />}
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: {
    backgroundColor: colors.surfaceElevated,
  },
  disabled: {
    opacity: 0.6,
  },
  label: {
    ...typography.small,
    color: colors.accent,
    fontWeight: "700",
  },
});
