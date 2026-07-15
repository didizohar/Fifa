import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "../../src/components/Button";
import { Screen } from "../../src/components/Screen";
import { colors, spacing, typography } from "../../src/theme";

export default function OnboardingScreen() {
  const router = useRouter();

  return (
    <Screen>
      <View style={styles.container}>
        <Text style={styles.logo}>⚽️</Text>
        <Text style={styles.title}>Welcome to FC Rival</Text>
        <Text style={styles.subtitle}>
          Track matches, ratings, and bragging rights with your group. Create a new group or join one with an
          invite code to get started.
        </Text>
        <View style={styles.actions}>
          <Button label="Create a group" onPress={() => router.push("/group/create")} />
          <Button label="Join with invite code" variant="secondary" onPress={() => router.push("/group/join")} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  logo: {
    fontSize: 56,
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.title,
    textAlign: "center",
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: spacing.xl,
  },
  actions: {
    width: "100%",
    gap: spacing.md,
  },
});
