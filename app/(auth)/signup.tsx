import { useState } from "react";
import { Link } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "../../src/components/Button";
import { Screen } from "../../src/components/Screen";
import { TextField } from "../../src/components/TextField";
import { signUpWithEmail } from "../../src/lib/auth";
import { colors, spacing, typography } from "../../src/theme";

export default function SignupScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  const handleSignup = async () => {
    if (!email.trim() || password.length < 6) {
      setError("Enter a valid email and a password of at least 6 characters.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await signUpWithEmail(email.trim(), password);
      if (!result.hasSession) {
        // Email confirmation is required on this project -- no session yet.
        setNeedsConfirmation(true);
      }
      // If a session came back, AuthProvider's listener redirects automatically.
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to sign up.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (needsConfirmation) {
    return (
      <Screen>
        <View style={styles.confirmContainer}>
          <Text style={styles.logo}>📬</Text>
          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.subtitle}>
            We sent a confirmation link to {email.trim()}. Tap it, then come back and sign in.
          </Text>
          <Link href="/(auth)/login" style={styles.link}>
            <Text style={styles.linkText}><Text style={styles.linkAccent}>Back to sign in</Text></Text>
          </Link>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.logo}>⚽️</Text>
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>Join or start a group afterward</Text>
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
          placeholder="At least 6 characters"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password-new"
          error={error}
        />
        <Button label="Sign up" onPress={handleSignup} loading={isSubmitting} />
      </View>
      <Link href="/(auth)/login" style={styles.link}>
        <Text style={styles.linkText}>Already have an account? <Text style={styles.linkAccent}>Sign in</Text></Text>
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
  confirmContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  logo: {
    fontSize: 48,
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.title,
    textAlign: "center",
  },
  subtitle: {
    ...typography.caption,
    textAlign: "center",
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
