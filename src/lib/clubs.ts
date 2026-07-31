import { isDuplicateClubName } from "./clubRepository";
import { supabase } from "./supabase";
import type { ClubVersion, CreateCustomClubInput, GameVersion, UpdateCustomClubInput } from "./types/database";

export async function fetchGameVersions(): Promise<GameVersion[]> {
  const { data, error } = await supabase.from("game_versions").select("*").order("name");
  if (error) throw new Error(`Failed to load game versions: ${error.message}`);
  return data ?? [];
}

const CLUB_VERSION_SELECT = "id, club_id, game_version_id, star_rating, club:clubs(id, name, country, league, primary_color, secondary_color, logo_url, group_id, notes, deleted_at)";

/**
 * Every club version visible to the caller for this game version -- RLS
 * (clubs_select / club_versions_select) already restricts rows to built-in
 * clubs (group_id IS NULL) plus the caller's own groups' custom clubs, so
 * no extra group filter is needed here. Filters out a soft-deleted (edited/
 * archived-away) club client-side, since PostgREST embed-column filters
 * need a `!inner` join hint whose exact behavior isn't worth depending on
 * here -- a plain filter after the fetch is unambiguous.
 */
export async function fetchClubVersions(gameVersionId: string): Promise<ClubVersion[]> {
  const { data, error } = await supabase
    .from("club_versions")
    .select(CLUB_VERSION_SELECT)
    .eq("game_version_id", gameVersionId)
    .order("star_rating", { ascending: false });

  if (error) throw new Error(`Failed to load clubs: ${error.message}`);
  return ((data ?? []) as unknown as ClubVersion[]).filter((cv) => !cv.club.deleted_at);
}

async function assertNoDuplicateClubName(name: string): Promise<void> {
  const { data, error } = await supabase.from("clubs").select("name").is("deleted_at", null);
  if (error) throw new Error(`Failed to check for duplicate clubs: ${error.message}`);
  if (isDuplicateClubName(name, (data ?? []).map((c) => c.name))) {
    throw new Error("A club with this name already exists.");
  }
}

const DEFAULT_CUSTOM_CLUB_STAR_RATING = 3;

/**
 * Creates a custom (group-owned) club plus its rating for one game
 * version. Only `name` is required; everything else defaults sensibly
 * (star rating 3, editable afterward). Not a single atomic transaction --
 * a failure between the two inserts leaves an orphaned, version-less club
 * row that simply never appears in any picker, not a data-integrity risk
 * worth a dedicated RPC for.
 */
export async function createCustomClub(input: CreateCustomClubInput): Promise<ClubVersion> {
  const name = input.name.trim();
  if (name.length === 0) throw new Error("Club name is required.");
  await assertNoDuplicateClubName(name);

  const { data: club, error: clubError } = await supabase
    .from("clubs")
    .insert({
      name,
      country: input.country ?? null,
      league: input.league ?? null,
      primary_color: input.primaryColor ?? null,
      secondary_color: input.secondaryColor ?? null,
      notes: input.notes ?? null,
      group_id: input.groupId,
    })
    .select()
    .single();
  if (clubError) throw new Error(`Failed to create club: ${clubError.message}`);

  const { data: version, error: versionError } = await supabase
    .from("club_versions")
    .insert({
      club_id: club.id,
      game_version_id: input.gameVersionId,
      star_rating: input.starRating ?? DEFAULT_CUSTOM_CLUB_STAR_RATING,
    })
    .select(CLUB_VERSION_SELECT)
    .single();
  if (versionError) throw new Error(`Failed to create club rating: ${versionError.message}`);
  return version as unknown as ClubVersion;
}

/** Edits a custom club's own fields (name/league/country/colors/notes) -- not its star rating, see updateCustomClubRating. RLS only permits this for a club the caller's group owns. */
export async function updateCustomClub(clubId: string, input: UpdateCustomClubInput): Promise<void> {
  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (trimmed.length === 0) throw new Error("Club name is required.");
    await assertNoDuplicateClubName(trimmed);
  }

  const { error } = await supabase
    .from("clubs")
    .update({
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.league !== undefined ? { league: input.league } : {}),
      ...(input.country !== undefined ? { country: input.country } : {}),
      ...(input.primaryColor !== undefined ? { primary_color: input.primaryColor } : {}),
      ...(input.secondaryColor !== undefined ? { secondary_color: input.secondaryColor } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    })
    .eq("id", clubId);
  if (error) throw new Error(`Failed to update club: ${error.message}`);
}

export async function updateCustomClubRating(clubVersionId: string, starRating: number): Promise<void> {
  const { error } = await supabase.from("club_versions").update({ star_rating: starRating }).eq("id", clubVersionId);
  if (error) throw new Error(`Failed to update club rating: ${error.message}`);
}

/** Soft-deletes a custom club (same convention as player_profiles) -- never a hard delete, so a club referenced by existing match history is never actually removed. */
export async function archiveCustomClub(clubId: string): Promise<void> {
  const { error } = await supabase.from("clubs").update({ deleted_at: new Date().toISOString() }).eq("id", clubId);
  if (error) throw new Error(`Failed to remove club: ${error.message}`);
}
