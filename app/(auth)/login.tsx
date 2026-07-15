import { useState } from "react";
import { Link } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "../../src/components/Button";
import { Screen } from "../../src/components/Screen";
import { TextField } from "../../src/components/TextField";
import { signInWithEmail } from "../../src/lib/auth";
import { colors, spacing, typography } from "../../src/theme";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await signInWithEmail(email.trim(), password);
      // AuthProvider's onAuthStateChange picks up the new session and the
      // root layout redirects automatically -- no manual navigation here.
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to sign in.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.logo}>⚽️</Text>
        <Text style={styles.title}>FC Rival</Text>
        <Text style={styles.subtitle}>Sign in to your group</Text>
      </View>
      <View style={styles.form}>
        <TextField
          label="Email"
          placeholder="you@example.com"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
        />
        <TextField
          label="Password"
          placeholder="••••••••"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
          error={error}
        />
        <Button label="Sign in" onPress={handleLogin} loading={isSubmitting} />
      </View>
      <Link href="/(auth)/signup" style={styles.link}>
        <Text style={styles.linkText}>Don't have an account? <Text style={styles.linkAccent}>Sign up</Text></Text>
      </Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    marginTop: spacing.xxl,
    marginBottom: spacing.xxl,
    alignItems: "center",
    gap: spacing.xs,
  },
  logo: {
    fontSize: 48,
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.display,
  },
  subtitle: {
    ...typography.caption,
  },
  form: {
    gap: spacing.lg,
  },
  link: {
    marginTop: spacing.xl,
    alignSelf: "center",
  },
  linkText: {
    ...typography.caption,
  },
  linkAccent: {
    color: colors.accent,
    fontWeight: "700",
  },
});
