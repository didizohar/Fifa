import type { RefObject } from "react";
import { Platform, type View } from "react-native";
import * as Sharing from "expo-sharing";
import { captureRef } from "react-native-view-shot";

/** Captures the given (already-mounted) view as a PNG and hands it to the native share sheet. Not supported in the web preview -- there's no device share sheet to hand off to. */
export async function shareViewAsImage(viewRef: RefObject<View | null>, dialogTitle: string): Promise<void> {
  if (Platform.OS === "web") {
    throw new Error("Sharing images isn't supported in the web preview -- try this on a device build.");
  }
  if (!viewRef.current) throw new Error("Nothing to share yet.");

  const uri = await captureRef(viewRef, { format: "png", quality: 1 });

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) throw new Error("Sharing isn't available on this device.");
  await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle });
}
