import { StyleSheet, Text, View } from "react-native";
import { spacing, typography } from "../theme";
import { Button } from "./Button";

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ message = "Something went wrong.", onRetry }: ErrorStateProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>⚠️</Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry ? <Button label="Try again" variant="secondary" onPress={onRetry} style={styles.action} /> : null}
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
