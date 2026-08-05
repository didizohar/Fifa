import { StyleSheet, Text, View } from "react-native";
import { colors, radius, shadows, spacing, typography } from "../theme";

export type ToastTone = "success" | "error";

interface ToastProps {
  message: string;
  tone?: ToastTone;
}

/** Presentational pill for a single toast message. Visibility/animation is owned by ToastProvider. */
export function Toast({ message, tone = "success" }: ToastProps) {
  return (
    <View style={[styles.container, tone === "error" ? styles.error : styles.success]}>
      <Text style={styles.message} numberOfLines={2}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    ...shadows.lg,
  },
  success: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.accent,
  },
  error: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.danger,
  },
  message: {
    ...typography.bodyStrong,
    textAlign: "center",
  },
});
