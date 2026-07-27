import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "../lib/i18n";
import { spacing, typography } from "../theme";
import { Button } from "./Button";

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>⚠️</Text>
      <Text style={styles.message}>{message ?? t("common.somethingWentWrong")}</Text>
      {onRetry ? <Button label={t("common.retry")} variant="secondary" onPress={onRetry} style={styles.action} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  icon: {
    fontSize: 32,
    marginBottom: spacing.sm,
  },
  message: {
    ...typography.body,
    textAlign: "center",
  },
  action: {
    marginTop: spacing.md,
    minWidth: 160,
  },
});
