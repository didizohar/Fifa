import { supabase } from "./supabase";
import type { ClubVersion, GameVersion } from "./types/database";

export async function fetchGameVersions(): Promise<GameVersion[]> {
  const { data, error } = await supabase.from("game_versions").select("*").order("name");
  if (error) throw new Error(`Failed to load game versions: ${error.message}`);
  return data ?? [];
}

export async function fetchClubVersions(gameVersionId: string): Promise<ClubVersion[]> {
  const { data, error } = await supabase
    .from("club_versions")
    .select("id, club_id, game_version_id, star_rating, club:clubs(id, name, country)")
    .eq("game_version_id", gameVersionId)
    .order("star_rating", { ascending: false });

  if (error) throw new Error(`Failed to load clubs: ${error.message}`);
  return (data ?? []) as unknown as ClubVersion[];
}
