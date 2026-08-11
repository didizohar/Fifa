import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { useMemo } from "react";
import { Text, TextInput, TextInputProps, View } from "react-native";
import { useTheme } from "../theme/ThemeContext";

interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string | null;
  /** Optional leading icon rendered inside the input (e.g. auth screens' mail/lock icons) -- purely additive, every existing caller that omits it is unaffected. */
  icon?: ComponentProps<typeof Ionicons>["name"];
}

export function TextField({ label, error, icon, style, ...inputProps }: TextFieldProps) {
  const { colors, radius, spacing, typography } = useTheme();
  const styles = useMemo(
    () => ({
      container: { gap: spacing.xs },
      label: { ...typography.caption },
      inputRow: { position: "relative" as const, justifyContent: "center" as const },
      icon: { position: "absolute" as const, left: spacing.md, zIndex: 1 },
      input: {
        height: 52,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        paddingHorizontal: spacing.md,
        paddingStart: icon ? spacing.md + 24 + spacing.sm : spacing.md,
        color: colors.textPrimary,
        fontSize: 15,
      },
      inputError: { borderColor: colors.danger },
      error: { ...typography.small, color: colors.danger },
    }),
    [colors, radius, spacing, typography, icon],
  );

  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.inputRow}>
        {icon ? <Ionicons name={icon} size={18} color={colors.textMuted} style={styles.icon} /> : null}
        <TextInput
          style={[styles.input, error ? styles.inputError : null, style]}
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={label ?? inputProps.placeholder}
          {...inputProps}
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}
