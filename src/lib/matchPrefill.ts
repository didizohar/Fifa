import type { MatchType } from "./types/database";

/** Route params as expo-router hands them back -- always strings (or absent), never the richer types they encode. */
export interface MatchPrefillRouteParams {
  [key: string]: string | undefined;
  matchType?: string;
  side1Players?: string;
  side2Players?: string;
  side1Club?: string;
  side2Club?: string;
}

export interface ValidatedMatchPrefill {
  matchType: MatchType;
  side1PlayerIds: string[];
  side2PlayerIds: string[];
  side1ClubId: string | null;
  side2ClubId: string | null;
}

/** Builds the typed route params for "Proceed to Record Match" from a drawn matchup. Player ids are comma-joined since route params are string-only. */
export function buildMatchPrefillParams(
  matchType: MatchType,
  sides: [{ id: string }[], { id: string }[]],
  sideClubs: [{ id: string }, { id: string }] | null,
): MatchPrefillRouteParams {
  const params: MatchPrefillRouteParams = {
    matchType,
    side1Players: sides[0].map((p) => p.id).join(","),
    side2Players: sides[1].map((p) => p.id).join(","),
  };
  if (sideClubs) {
    params.side1Club = sideClubs[0].id;
    params.side2Club = sideClubs[1].id;
  }
  return params;
}

/**
 * Re-validates a draw-result prefill against the Record Match screen's own
 * currently-loaded roster and club list -- a player could have been
 * archived, or the group's club list could differ, between the draw and
 * landing here. Returns null only when there's nothing usable at all
 * (unrecognized match type); otherwise each field is validated
 * independently so one bad value doesn't discard the rest.
 */
export function validateMatchPrefill(
  raw: MatchPrefillRouteParams,
  availablePlayerIds: readonly string[],
  availableClubVersionIds: readonly string[],
): ValidatedMatchPrefill | null {
  if (raw.matchType !== "singles" && raw.matchType !== "doubles") return null;
  const requiredPerSide = raw.matchType === "singles" ? 1 : 2;

  const parseSide = (value: string | undefined): string[] => {
    if (!value) return [];
    const ids = value.split(",").filter(Boolean);
    if (ids.length !== requiredPerSide) return [];
    return ids.every((id) => availablePlayerIds.includes(id)) ? ids : [];
  };

  let side1PlayerIds = parseSide(raw.side1Players);
  let side2PlayerIds = parseSide(raw.side2Players);
  if (side1PlayerIds.some((id) => side2PlayerIds.includes(id))) {
    // A player can't be prefilled onto both sides -- drop both rather than guess which side is right.
    side1PlayerIds = [];
    side2PlayerIds = [];
  }

  const side1ClubId = raw.side1Club && availableClubVersionIds.includes(raw.side1Club) ? raw.side1Club : null;
  const side2ClubId = raw.side2Club && availableClubVersionIds.includes(raw.side2Club) ? raw.side2Club : null;

  return { matchType: raw.matchType, side1PlayerIds, side2PlayerIds, side1ClubId, side2ClubId };
}
