import { ReactNode } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, StyleSheet, TouchableWithoutFeedback, View, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing } from "../theme";

interface ScreenProps {
  children: ReactNode;
  style?: ViewStyle;
  padded?: boolean;
}

export function Screen({ children, style, padded = true }: ScreenProps) {
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
      >
        {/* TouchableWithoutFeedback only fires when a touch isn't claimed by a
            child responder first, so this never steals taps from buttons,
            inputs, or scroll gestures -- it only dismisses the keyboard when
            the user taps genuinely empty space. */}
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.webCenter}>
            <View style={[styles.container, styles.webMaxWidth, padded && styles.padded, style]}>{children}</View>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
  },
  padded: {
    paddingHorizontal: spacing.lg,
  },
  // On web, content stays centered with a sensible max width instead of
  // stretching cards/charts across a wide browser window; native platforms
  // are unaffected (width: "100%" is a no-op at any mobile screen size).
  webCenter: {
    flex: 1,
    alignItems: Platform.OS === "web" ? "center" : "stretch",
  },
  webMaxWidth: {
    width: "100%",
    maxWidth: Platform.OS === "web" ? 560 : undefined,
  },
});
