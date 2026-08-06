import type { MatchSummary } from "./matches";

export interface PreviousMatchClubs {
  side1ClubVersionId: string;
  side2ClubVersionId: string;
  side1ClubName: string;
  side2ClubName: string;
}

/**
 * Extracts the two club_version_ids (and display names, for a "previous
 * match: X vs Y" preview line) from a match -- null when either side has no
 * club recorded (e.g. legacy data from before club_version_id existed), so
 * callers can hide the "Same Clubs"/"Swap Clubs" quick actions entirely
 * rather than offer an action with nothing to apply. Takes a single match
 * (not a list) so it's reusable from any screen that already knows which
 * match counts as "previous" -- Record Match uses the group's most recent
 * match; a future Quick Match "next match" flow would pass the match it
 * just saved instead.
 */
export function getPreviousMatchClubs(match: MatchSummary | null | undefined): PreviousMatchClubs | null {
  if (!match) return null;
  const [side1, side2] = match.sides;
  if (!side1.club_version_id || !side2.club_version_id || !side1.club || !side2.club) return null;
  return {
    side1ClubVersionId: side1.club_version_id,
    side2ClubVersionId: side2.club_version_id,
    side1ClubName: side1.club.name,
    side2ClubName: side2.club.name,
  };
}

/** Same two clubs, sides swapped -- side 1 gets what side 2 had and vice versa. */
export function swapPreviousMatchClubs(clubs: PreviousMatchClubs): PreviousMatchClubs {
  return {
    side1ClubVersionId: clubs.side2ClubVersionId,
    side2ClubVersionId: clubs.side1ClubVersionId,
    side1ClubName: clubs.side2ClubName,
    side2ClubName: clubs.side1ClubName,
  };
}
