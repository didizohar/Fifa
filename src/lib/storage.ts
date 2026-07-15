import { decode } from "base64-arraybuffer";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "./supabase";

export interface PickedAvatar {
  publicUrl: string;
  path: string;
}

/**
 * Prompts for photo-library permission, lets the user pick and crop a
 * square image, uploads it to the `avatars` bucket, and returns its public
 * URL. Returns null if the user cancels (not an error). The caller is
 * responsible for writing the returned URL onto player_profiles.avatar_url
 * via players.ts's updatePlayer -- this function only handles storage.
 */
export async function pickAndUploadAvatar(groupId: string, playerId: string): Promise<PickedAvatar | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Photo library access is required to set an avatar.");
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
  });

  if (result.canceled || result.assets.length === 0) return null;

  const asset = result.assets[0]!;
  const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: "base64" });
  const arrayBuffer = decode(base64);
  const path = `${groupId}/${playerId}/${Date.now()}.jpg`;

  const { error: uploadError } = await supabase.storage.from("avatars").upload(path, arrayBuffer, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (uploadError) throw new Error(`Failed to upload avatar: ${uploadError.message}`);

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return { publicUrl: data.publicUrl, path };
}
