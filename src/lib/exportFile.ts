// See the comment in storage.ts -- SDK 57's top-level "expo-file-system"
// export only ships throwing deprecation shims; /legacy has the real thing.
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

/**
 * Saves CSV content and hands it off to the user: a browser download on
 * web, or the native share sheet on iOS/Android (there's no "download" of
 * an arbitrary file on native without one).
 */
export async function exportCsv(filename: string, csv: string): Promise<void> {
  if (Platform.OS === "web") {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return;
  }

  if (!FileSystem.cacheDirectory) throw new Error("No writable cache directory is available on this device.");
  const fileUri = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: "utf8" });

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) throw new Error("Sharing isn't available on this device.");
  await Sharing.shareAsync(fileUri, { mimeType: "text/csv", dialogTitle: filename });
}
