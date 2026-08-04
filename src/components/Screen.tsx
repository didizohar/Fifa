import { ReactNode } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, StyleSheet, TouchableWithoutFeedback, View, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { RenderProfiler } from "../lib/renderProfiler";
import { colors, spacing } from "../theme";

interface ScreenProps {
  children: ReactNode;
  style?: ViewStyle;
  padded?: boolean;
  /**
   * Opt-in only -- pass true on screens that render a TextField/TextInput.
   * KeyboardAvoidingView was previously applied unconditionally to every
   * screen in the app, most of which have no text input at all. It does its
   * own layout measurement/settle pass on mount (needed to compute its
   * padding against the keyboard), which has no purpose on an input-less
   * screen and was a real, needless source of an extra layout pass right as
   * the screen became interactive.
   */
  avoidKeyboard?: boolean;
}

export function Screen({ children, style, padded = true, avoidKeyboard = false }: ScreenProps) {
  const inner = (
    <View style={styles.webCenter}>
      <View style={[styles.container, styles.webMaxWidth, padded && styles.padded, style]}>
        <RenderProfiler id="Screen">{children}</RenderProfiler>
      </View>
    </View>
  );

  // Tap-outside-to-dismiss-keyboard only has a purpose on screens that
  // actually render a TextField -- same rationale as avoidKeyboard below,
  // and previously the same "applies unconditionally to every screen"
  // mistake, just for TouchableWithoutFeedback instead of
  // KeyboardAvoidingView. TouchableWithoutFeedback uses RN's legacy
  // responder system, which wrapping every screen's entire content
  // (including every inner Pressable) in unconditionally risked a
  // touch-responder negotiation conflict with modern Pressable/gesture
  // handler components for the ~35 screens that never had a keyboard to
  // dismiss in the first place.
  const content = avoidKeyboard ? <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>{inner}</TouchableWithoutFeedback> : inner;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      {avoidKeyboard ? (
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
        >
          {content}
        </KeyboardAvoidingView>
      ) : (
        content
      )}
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
