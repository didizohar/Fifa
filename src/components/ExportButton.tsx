import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { notify } from "../lib/confirm";
import { exportCsv } from "../lib/exportFile";
import { colors, radius, spacing, typography } from "../theme";

interface ExportButtonProps {
  label?: string;
  filename: string;
  /** Builds the CSV content lazily, only when the user actually taps export. */
  getCsv: () => string;
}

/** Small icon+label button that exports the given CSV via the native share sheet or a web download. */
export function ExportButton({ label = "Export CSV", filename, getCsv }: ExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  const handlePress = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      await exportCsv(filename, getCsv());
    } catch (e) {
      notify("Couldn't export CSV", e instanceof Error ? e.message : "Please try again.");
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
