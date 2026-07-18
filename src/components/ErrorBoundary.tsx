import { Component, ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "./Button";
import { colors, spacing, typography } from "../theme";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Expo Router doesn't provide a root crash boundary -- without this, any
 * uncaught render exception anywhere in the tree takes down the whole app
 * to a blank/red screen with no recovery path. "Try again" just resets the
 * boundary; if the underlying state that caused the crash is still present
 * the user can back out via normal navigation rather than being stuck.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <Text style={styles.icon}>⚠️</Text>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            FC Rival hit an unexpected error. Your data is safe -- try again, and if it keeps happening, restart the app.
          </Text>
          <Button label="Try again" onPress={this.reset} style={styles.action} />
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  icon: {
    fontSize: 40,
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.heading,
    textAlign: "center",
  },
  message: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: "center",
  },
  action: {
    marginTop: spacing.lg,
    minWidth: 180,
  },
});
