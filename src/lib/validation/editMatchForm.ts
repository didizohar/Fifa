import type { MatchSummary } from "../matches";
import type { EditMatchPayload, GroupRole, MatchType } from "../types/database";
import { validateMatchForm, type ComputedMatchResult, type MatchFormValidation, type MatchSideDraft } from "./matchForm";

/**
 * Group admins/owners may edit any match in their group; any other member
 * may only edit a match they themselves recorded. Mirrors the same rule
 * enforced server-side in update_match -- this is purely for deciding
 * whether to show the action in the UI, not a real security boundary.
 */
export function canEditMatch(currentRole: GroupRole | null, userId: string | null | undefined, createdBy: string | null | undefined): boolean {
  if (currentRole === "owner" || currentRole === "admin") return true;
  return !!userId && !!createdBy && userId === createdBy;
}

export interface EditableMatchDraft {
  matchType: MatchType;
  side1: MatchSideDraft;
  side2: MatchSideDraft;
  isOvertime: boolean;
  isPenalties: boolean;
  penaltyScore1: number | null;
  penaltyScore2: number | null;
  notes: string;
  /** yyyy-mm-dd, local time. */
  dateInput: string;
  /** HH:mm, local time, 24-hour. */
  timeInput: string;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatDateForInput(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatTimeForInput(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;

/**
 * Parses a yyyy-mm-dd + HH:mm pair (local time) into a Date, rejecting
 * anything `new Date(y, m, d, ...)` would otherwise silently roll over
 * (month 13, day 32, hour 25, ...) instead of erroring on.
 */
export function parseMatchDateTime(dateInput: string, timeInput: string): Date | null {
  const dateMatch = DATE_PATTERN.exec(dateInput);
  const timeMatch = TIME_PATTERN.exec(timeInput);
  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);

  const date = new Date(year, month - 1, day, hours, minutes, 0, 0);
  const roundTrips =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date.getHours() === hours &&
    date.getMinutes() === minutes;

  return roundTrips ? date : null;
}

/** Loads a saved match's exact current values into the same draft shape the record-match form edits, so nothing is silently reset. */
export function buildEditableMatchForm(match: MatchSummary): EditableMatchDraft {
  const [s1, s2] = match.sides;
  return {
    matchType: match.match_type,
    side1: { clubVersionId: s1.club_version_id ?? null, playerIds: s1.players.map((p) => p.id), score: s1.score },
    side2: { clubVersionId: s2.club_version_id ?? null, playerIds: s2.players.map((p) => p.id), score: s2.score },
    isOvertime: match.is_overtime,
    isPenalties: match.is_penalties,
    penaltyScore1: s1.penalty_score,
    penaltyScore2: s2.penalty_score,
    notes: match.notes ?? "",
    dateInput: formatDateForInput(match.played_at),
    timeInput: formatTimeForInput(match.played_at),
  };
}

/**
 * Thin wrapper over validateMatchForm -- edited matches follow exactly the
 * same rules as newly-recorded ones, nothing edit-specific to add. Takes
 * just the subset of EditableMatchDraft that validation actually needs
 * (matchType/side1/side2/isPenalties/penaltyScores), same as
 * validateMatchForm itself, so callers don't need a full draft on hand.
 */
export function validateEditedMatch(
  draft: Pick<EditableMatchDraft, "matchType" | "side1" | "side2" | "isPenalties" | "penaltyScore1" | "penaltyScore2">,
  groupPlayerIds: string[],
): MatchFormValidation {
  return validateMatchForm(draft, groupPlayerIds);
}

function sameIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((id, i) => id === sortedB[i]);
}

export interface MatchChangeFlags {
  participantsChanged: boolean;
  clubsChanged: boolean;
  scoreOrResultChanged: boolean;
  dateChanged: boolean;
  /** Notes, overtime flag -- anything that doesn't affect statistics. */
  otherChanged: boolean;
  anyChanged: boolean;
}

/** Field-by-field diff between the originally-loaded draft and the current form state, used both for the unsaved-changes guard and to decide whether the "this will update statistics" confirmation is warranted. */
export function compareMatchSnapshots(original: EditableMatchDraft, edited: EditableMatchDraft): MatchChangeFlags {
  const participantsChanged =
    original.matchType !== edited.matchType ||
    !sameIdSet(original.side1.playerIds, edited.side1.playerIds) ||
    !sameIdSet(original.side2.playerIds, edited.side2.playerIds);

  const clubsChanged = original.side1.clubVersionId !== edited.side1.clubVersionId || original.side2.clubVersionId !== edited.side2.clubVersionId;

  const scoreOrResultChanged =
    original.side1.score !== edited.side1.score ||
    original.side2.score !== edited.side2.score ||
    original.isPenalties !== edited.isPenalties ||
    original.penaltyScore1 !== edited.penaltyScore1 ||
    original.penaltyScore2 !== edited.penaltyScore2;

  const dateChanged = original.dateInput !== edited.dateInput || original.timeInput !== edited.timeInput;

  const otherChanged = original.notes !== edited.notes || original.isOvertime !== edited.isOvertime;

  return {
    participantsChanged,
    clubsChanged,
    scoreOrResultChanged,
    dateChanged,
    otherChanged,
    anyChanged: participantsChanged || clubsChanged || scoreOrResultChanged || dateChanged || otherChanged,
  };
}

/** True if any field differs from what was originally loaded -- drives the unsaved-changes leave-guard. */
export function hasMatchChanges(original: EditableMatchDraft, edited: EditableMatchDraft): boolean {
  return compareMatchSnapshots(original, edited).anyChanged;
}

/**
 * Merges a validated edit draft with the fields validation doesn't touch
 * (date/time, notes, group id, the match's own id) into the payload
 * update_match expects. Returns null only when the date/time inputs
 * themselves don't parse -- validateEditedMatch is responsible for every
 * other field-level error.
 */
export function reconcileEditedMatchResult(
  matchId: string,
  groupId: string,
  draft: EditableMatchDraft,
  computed: ComputedMatchResult,
): EditMatchPayload | null {
  const playedAtDate = parseMatchDateTime(draft.dateInput, draft.timeInput);
  if (!playedAtDate) return null;

  const trimmedNotes = draft.notes.trim();

  return {
    matchId,
    groupId,
    playedAt: playedAtDate.toISOString(),
    matchType: draft.matchType,
    isOvertime: draft.isOvertime,
    isPenalties: draft.isPenalties,
    notes: trimmedNotes.length > 0 ? trimmedNotes : null,
    penaltyWinnerSide: computed.penaltyWinnerSide,
    sides: [
      {
        clubVersionId: draft.side1.clubVersionId!,
        score: draft.side1.score,
        penaltyScore: draft.isPenalties ? draft.penaltyScore1 : null,
        result: computed.side1Result,
        playerIds: draft.side1.playerIds,
      },
      {
        clubVersionId: draft.side2.clubVersionId!,
        score: draft.side2.score,
        penaltyScore: draft.isPenalties ? draft.penaltyScore2 : null,
        result: computed.side2Result,
        playerIds: draft.side2.playerIds,
      },
    ],
  };
}
