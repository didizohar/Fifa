import * as Clipboard from "expo-clipboard";
import { Share } from "react-native";

export async function copyResultText(text: string): Promise<void> {
  await Clipboard.setStringAsync(text);
}

export async function shareResultText(text: string): Promise<void> {
  await Share.share({ message: text });
}
