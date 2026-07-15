import { Alert, Platform } from "react-native";

/**
 * Alert.alert() silently no-ops on react-native-web (no dialog, no
 * callback, no error) -- confirmation prompts must go through this instead
 * of calling Alert.alert directly, or the action becomes unreachable on web.
 */
export function confirmAction(
  title: string,
  message: string | undefined,
  confirmLabel: string,
  onConfirm: () => void,
): void {
  if (Platform.OS === "web") {
    const text = message ? `${title}\n\n${message}` : title;
    if (typeof window !== "undefined" && window.confirm(text)) onConfirm();
    return;
  }

  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: confirmLabel, style: "destructive", onPress: onConfirm },
  ]);
}

/** Same react-native-web limitation as confirmAction, for plain (non-confirming) alerts. */
export function notify(title: string, message?: string): void {
  if (Platform.OS === "web") {
    const text = message ? `${title}\n\n${message}` : title;
    if (typeof window !== "undefined") window.alert(text);
    return;
  }
  Alert.alert(title, message);
}
