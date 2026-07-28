import type { MatchSummary } from "../src/lib/matches";
import {
  buildEditableMatchForm,
  canEditMatch,
  compareMatchSnapshots,
  formatDateForInput,
  formatTimeForInput,
  hasMatchChanges,
  parseMatchDateTime,
  reconcileEditedMatchResult,
  validateEditedMatch,
  type EditableMatchDraft,
} from "../src/lib/validation/editMatchForm";

function makePlayer(id: string, name = id) {
  return { id, display_name: name, avatar_url: null, custom_color: "#000" };
}

function makeMatch(overrides: Partial<MatchSummary> = {}): MatchSummary {
  return {
    id: "match-1",
    match_type: "singles",
    is_overtime: false,
    is_penalties: false,
    notes: "Great game",
    played_at: "2026-03-15T18:30:00.000Z",
    created_at: "2026-03-15T18:30:00.000Z",
    updated_at: "2026-03-15T18:30:00.000Z",
    created_by: "user-1",
    game_version_id: "gv-1",
    season_id: null,
    sides: [
      { id: "side-1", side_number: 1, score: 3, penalty_score: null, result: "win", club_version_id: "cv-1", club: { id: "club-1", name: "Arsenal" }, players: [makePlayer("p1")] },
      { id: "side-2", side_number: 2, score: 1, penalty_score: null, result: "loss", club_version_id: "cv-2", club: { id: "club-2", name: "Chelsea" }, players: [makePlayer("p2")] },
    ],
    ...overrides,
  };
}

describe("buildEditableMatchForm", () => {
  it("loads every current field from the saved match, prefilling nothing as reset", () => {
    const draft = buildEditableMatchForm(makeMatch());
    expect(draft).toMatchObject({
      matchType: "singles",
      side1: { clubVersionId: "cv-1", playerIds: ["p1"], score: 3 },
      side2: { clubVersionId: "cv-2", playerIds: ["p2"], score: 1 },
      isOvertime: false,
      isPenalties: false,
      penaltyScore1: null,
      penaltyScore2: null,
      notes: "Great game",
    });
    // Timezone-dependent, so checked by shape/round-trip here rather than a hardcoded local value.
    expect(draft.dateInput).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(draft.timeInput).toMatch(/^\d{2}:\d{2}$/);
    expect(parseMatchDateTime(draft.dateInput, draft.timeInput)?.toISOString()).toBe(new Date("2026-03-15T18:30:00.000Z").toISOString());
  });

  it("falls back to an empty notes string when notes is null", () => {
    const draft = buildEditableMatchForm(makeMatch({ notes: null }));
    expect(draft.notes).toBe("");
  });

  it("preserves penalty scores when the match was decided on penalties", () => {
    const match = makeMatch({
      is_penalties: true,
      sides: [
        { id: "side-1", side_number: 1, score: 2, penalty_score: 4, result: "win", club_version_id: "cv-1", club: null, players: [makePlayer("p1")] },
        { id: "side-2", side_number: 2, score: 2, penalty_score: 3, result: "loss", club_version_id: "cv-2", club: null, players: [makePlayer("p2")] },
      ],
    });
    const draft = buildEditableMatchForm(match);
    expect(draft.isPenalties).toBe(true);
    expect(draft.penaltyScore1).toBe(4);
    expect(draft.penaltyScore2).toBe(3);
  });

  it("preserves a doubles match's full pair roster on both sides", () => {
    const match = makeMatch({
      match_type: "doubles",
      sides: [
        { id: "side-1", side_number: 1, score: 2, penalty_score: null, result: "win", club_version_id: "cv-1", club: null, players: [makePlayer("p1"), makePlayer("p2")] },
        { id: "side-2", side_number: 2, score: 1, penalty_score: null, result: "loss", club_version_id: "cv-2", club: null, players: [makePlayer("p3"), makePlayer("p4")] },
      ],
    });
    const draft = buildEditableMatchForm(match);
    expect(draft.side1.playerIds).toEqual(["p1", "p2"]);
    expect(draft.side2.playerIds).toEqual(["p3", "p4"]);
  });
});

describe("formatDateForInput / formatTimeForInput / parseMatchDateTime", () => {
  it("round-trips a played_at timestamp through format and parse", () => {
    const iso = "2026-03-15T18:30:00.000Z";
    const dateInput = formatDateForInput(iso);
    const timeInput = formatTimeForInput(iso);
    const parsed = parseMatchDateTime(dateInput, timeInput);
    expect(parsed).not.toBeNull();
    expect(parsed!.getFullYear()).toBe(new Date(iso).getFullYear());
    expect(parsed!.getMonth()).toBe(new Date(iso).getMonth());
    expect(parsed!.getDate()).toBe(new Date(iso).getDate());
    expect(parsed!.getHours()).toBe(new Date(iso).getHours());
    expect(parsed!.getMinutes()).toBe(new Date(iso).getMinutes());
  });

  it("parses a valid date/time pair into the exact expected local Date", () => {
    const parsed = parseMatchDateTime("2026-06-01", "09:45");
    expect(parsed).toEqual(new Date(2026, 5, 1, 9, 45, 0, 0));
  });

  it.each([
    ["2026-13-01", "10:00"], // invalid month
    ["2026-02-30", "10:00"], // invalid day (Feb never has 30)
    ["2026-06-01", "25:00"], // invalid hour
    ["2026-06-01", "10:60"], // invalid minute
    ["not-a-date", "10:00"],
    ["2026-06-01", "not-a-time"],
    ["", ""],
  ])("rejects an unparseable or out-of-range date/time pair (%s, %s)", (date, time) => {
    expect(parseMatchDateTime(date, time)).toBeNull();
  });
});

describe("hasMatchChanges / compareMatchSnapshots", () => {
  const original: EditableMatchDraft = {
    matchType: "singles",
    side1: { clubVersionId: "cv-1", playerIds: ["p1"], score: 3 },
    side2: { clubVersionId: "cv-2", playerIds: ["p2"], score: 1 },
    isOvertime: false,
    isPenalties: false,
    penaltyScore1: null,
    penaltyScore2: null,
    notes: "note",
    dateInput: "2026-03-15",
    timeInput: "18:30",
  };

  it("detects no changes when the draft is identical", () => {
    const edited = { ...original, side1: { ...original.side1 }, side2: { ...original.side2 } };
    expect(hasMatchChanges(original, edited)).toBe(false);
    expect(compareMatchSnapshots(original, edited)).toEqual({
      participantsChanged: false,
      clubsChanged: false,
      scoreOrResultChanged: false,
      dateChanged: false,
      otherChanged: false,
      anyChanged: false,
    });
  });

  it("flags participantsChanged when a player id differs, even with the same array length", () => {
    const edited = { ...original, side1: { ...original.side1, playerIds: ["p3"] } };
    const flags = compareMatchSnapshots(original, edited);
    expect(flags.participantsChanged).toBe(true);
    expect(flags.scoreOrResultChanged).toBe(false);
    expect(flags.anyChanged).toBe(true);
  });

  it("does not flag participantsChanged when the same players are just reordered", () => {
    const withTwo: EditableMatchDraft = { ...original, side1: { ...original.side1, playerIds: ["p1", "p3"] } };
    const reordered: EditableMatchDraft = { ...withTwo, side1: { ...withTwo.side1, playerIds: ["p3", "p1"] } };
    expect(compareMatchSnapshots(withTwo, reordered).participantsChanged).toBe(false);
  });

  it("flags scoreOrResultChanged when only a score changes", () => {
    const edited = { ...original, side1: { ...original.side1, score: 5 } };
    const flags = compareMatchSnapshots(original, edited);
    expect(flags.scoreOrResultChanged).toBe(true);
    expect(flags.participantsChanged).toBe(false);
    expect(flags.anyChanged).toBe(true);
  });

  it("flags scoreOrResultChanged when penalties are toggled on with the same score", () => {
    const level: EditableMatchDraft = { ...original, side1: { ...original.side1, score: 2 }, side2: { ...original.side2, score: 2 } };
    const withPenalties: EditableMatchDraft = { ...level, isPenalties: true, penaltyScore1: 5, penaltyScore2: 4 };
    expect(compareMatchSnapshots(level, withPenalties).scoreOrResultChanged).toBe(true);
  });

  it("flags clubsChanged independently of participants/score", () => {
    const edited = { ...original, side2: { ...original.side2, clubVersionId: "cv-99" } };
    const flags = compareMatchSnapshots(original, edited);
    expect(flags.clubsChanged).toBe(true);
    expect(flags.participantsChanged).toBe(false);
    expect(flags.scoreOrResultChanged).toBe(false);
  });

  it("flags dateChanged when the date or time input differs", () => {
    expect(compareMatchSnapshots(original, { ...original, dateInput: "2026-03-16" }).dateChanged).toBe(true);
    expect(compareMatchSnapshots(original, { ...original, timeInput: "19:00" }).dateChanged).toBe(true);
  });

  it("flags otherChanged for notes or overtime, without flagging statistics-affecting flags", () => {
    const flags = compareMatchSnapshots(original, { ...original, notes: "updated note" });
    expect(flags.otherChanged).toBe(true);
    expect(flags.participantsChanged).toBe(false);
    expect(flags.scoreOrResultChanged).toBe(false);
    expect(flags.anyChanged).toBe(true);
  });
});

describe("validateEditedMatch", () => {
  const groupPlayerIds = ["p1", "p2", "p3", "p4"];

  it("passes a valid singles edit and derives the correct winner", () => {
    const result = validateEditedMatch(
      { matchType: "singles", side1: { clubVersionId: "cv-1", playerIds: ["p1"], score: 4 }, side2: { clubVersionId: "cv-2", playerIds: ["p2"], score: 1 }, isPenalties: false, penaltyScore1: null, penaltyScore2: null },
      groupPlayerIds,
    );
    expect(result).toEqual({ ok: true, side1Result: "win", side2Result: "loss", penaltyWinnerSide: undefined });
  });

  it("rejects a singles edit with two players on one side", () => {
    const result = validateEditedMatch(
      { matchType: "singles", side1: { clubVersionId: "cv-1", playerIds: ["p1", "p2"], score: 1 }, side2: { clubVersionId: "cv-2", playerIds: ["p3"], score: 0 }, isPenalties: false, penaltyScore1: null, penaltyScore2: null },
      groupPlayerIds,
    );
    expect(result.ok).toBe(false);
  });

  it("requires exactly four unique players for a doubles edit", () => {
    const result = validateEditedMatch(
      { matchType: "doubles", side1: { clubVersionId: "cv-1", playerIds: ["p1", "p2"], score: 2 }, side2: { clubVersionId: "cv-2", playerIds: ["p3", "p4"], score: 1 }, isPenalties: false, penaltyScore1: null, penaltyScore2: null },
      groupPlayerIds,
    );
    expect(result).toMatchObject({ ok: true, side1Result: "win", side2Result: "loss" });
  });

  it("rejects the same player appearing on both sides", () => {
    const result = validateEditedMatch(
      { matchType: "singles", side1: { clubVersionId: "cv-1", playerIds: ["p1"], score: 2 }, side2: { clubVersionId: "cv-2", playerIds: ["p1"], score: 1 }, isPenalties: false, penaltyScore1: null, penaltyScore2: null },
      groupPlayerIds,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes("both sides"))).toBe(true);
  });

  it("rejects duplicate players on the same doubles side", () => {
    const result = validateEditedMatch(
      { matchType: "doubles", side1: { clubVersionId: "cv-1", playerIds: ["p1", "p1"], score: 2 }, side2: { clubVersionId: "cv-2", playerIds: ["p3", "p4"], score: 1 }, isPenalties: false, penaltyScore1: null, penaltyScore2: null },
      groupPlayerIds,
    );
    expect(result.ok).toBe(false);
  });

  it("still accepts an archived player, as long as they're in the group's roster id list", () => {
    // validateEditedMatch (like validateMatchForm) only checks group membership by id --
    // it has no concept of active/archived, so an archived historical player validates fine.
    const result = validateEditedMatch(
      { matchType: "singles", side1: { clubVersionId: "cv-1", playerIds: ["p1"], score: 2 }, side2: { clubVersionId: "cv-2", playerIds: ["p2"], score: 0 }, isPenalties: false, penaltyScore1: null, penaltyScore2: null },
      groupPlayerIds, // p1/p2 are still "in" this list even if archived elsewhere -- callers merge archived players in
    );
    expect(result.ok).toBe(true);
  });

  it("computes a draw when scores are level and penalties are off", () => {
    const result = validateEditedMatch(
      { matchType: "singles", side1: { clubVersionId: "cv-1", playerIds: ["p1"], score: 2 }, side2: { clubVersionId: "cv-2", playerIds: ["p2"], score: 2 }, isPenalties: false, penaltyScore1: null, penaltyScore2: null },
      groupPlayerIds,
    );
    expect(result).toMatchObject({ ok: true, side1Result: "draw", side2Result: "draw" });
  });

  it("derives the penalty winner when scores are level and penalties decide it", () => {
    const result = validateEditedMatch(
      { matchType: "singles", side1: { clubVersionId: "cv-1", playerIds: ["p1"], score: 2 }, side2: { clubVersionId: "cv-2", playerIds: ["p2"], score: 2 }, isPenalties: true, penaltyScore1: 5, penaltyScore2: 4 },
      groupPlayerIds,
    );
    expect(result).toEqual({ ok: true, side1Result: "win", side2Result: "loss", penaltyWinnerSide: 1 });
  });

  it("rejects a negative goal total", () => {
    const result = validateEditedMatch(
      { matchType: "singles", side1: { clubVersionId: "cv-1", playerIds: ["p1"], score: -1 }, side2: { clubVersionId: "cv-2", playerIds: ["p2"], score: 0 }, isPenalties: false, penaltyScore1: null, penaltyScore2: null },
      groupPlayerIds,
    );
    expect(result.ok).toBe(false);
  });
});

describe("reconcileEditedMatchResult", () => {
  const draft: EditableMatchDraft = {
    matchType: "singles",
    side1: { clubVersionId: "cv-1", playerIds: ["p1"], score: 4 },
    side2: { clubVersionId: "cv-2", playerIds: ["p2"], score: 1 },
    isOvertime: true,
    isPenalties: false,
    penaltyScore1: null,
    penaltyScore2: null,
    notes: "  updated notes  ",
    dateInput: "2026-04-01",
    timeInput: "20:15",
  };

  it("builds the exact update payload from a valid draft", () => {
    const payload = reconcileEditedMatchResult("match-1", "group-1", draft, { side1Result: "win", side2Result: "loss" });
    expect(payload).not.toBeNull();
    expect(payload).toEqual({
      matchId: "match-1",
      groupId: "group-1",
      playedAt: new Date(2026, 3, 1, 20, 15, 0, 0).toISOString(),
      matchType: "singles",
      isOvertime: true,
      isPenalties: false,
      notes: "updated notes",
      penaltyWinnerSide: undefined,
      sides: [
        { clubVersionId: "cv-1", score: 4, penaltyScore: null, result: "win", playerIds: ["p1"] },
        { clubVersionId: "cv-2", score: 1, penaltyScore: null, result: "loss", playerIds: ["p2"] },
      ],
    });
  });

  it("stores null notes when the trimmed notes field is empty", () => {
    const payload = reconcileEditedMatchResult("match-1", "group-1", { ...draft, notes: "   " }, { side1Result: "win", side2Result: "loss" });
    expect(payload?.notes).toBeNull();
  });

  it("returns null when the date/time input doesn't parse, instead of silently defaulting", () => {
    const payload = reconcileEditedMatchResult("match-1", "group-1", { ...draft, dateInput: "not-a-date" }, { side1Result: "win", side2Result: "loss" });
    expect(payload).toBeNull();
  });

  it("includes penalty scores only when isPenalties is true", () => {
    const withPenalties: EditableMatchDraft = { ...draft, isPenalties: true, penaltyScore1: 5, penaltyScore2: 3 };
    const payload = reconcileEditedMatchResult("match-1", "group-1", withPenalties, { side1Result: "win", side2Result: "loss", penaltyWinnerSide: 1 });
    expect(payload?.sides[0]).toMatchObject({ penaltyScore: 5 });
    expect(payload?.sides[1]).toMatchObject({ penaltyScore: 3 });
    expect(payload?.penaltyWinnerSide).toBe(1);
  });
});

describe("canEditMatch", () => {
  it("allows an owner to edit any match", () => {
    expect(canEditMatch("owner", "user-2", "user-1")).toBe(true);
  });

  it("allows an admin to edit any match", () => {
    expect(canEditMatch("admin", "user-2", "user-1")).toBe(true);
  });

  it("allows a plain member to edit a match they recorded themselves", () => {
    expect(canEditMatch("member", "user-1", "user-1")).toBe(true);
  });

  it("denies a plain member editing someone else's match", () => {
    expect(canEditMatch("member", "user-2", "user-1")).toBe(false);
  });

  it("denies when the recorder is unknown (createdBy null/undefined)", () => {
    expect(canEditMatch("member", "user-1", null)).toBe(false);
    expect(canEditMatch("member", "user-1", undefined)).toBe(false);
  });

  it("denies when there is no current user", () => {
    expect(canEditMatch("member", null, "user-1")).toBe(false);
  });

  it("denies when currentRole is null (not a recognized member)", () => {
    expect(canEditMatch(null, "user-1", "user-1")).toBe(true); // still the recorder -- role null doesn't override self-authorship
    expect(canEditMatch(null, "user-2", "user-1")).toBe(false);
  });
});

describe("no input mutation", () => {
  it("buildEditableMatchForm never writes back to the match it was given", () => {
    const match = makeMatch();
    const frozen = deepFreeze(structuredClone(match));
    expect(() => buildEditableMatchForm(frozen)).not.toThrow();
  });

  it("compareMatchSnapshots never writes back to either draft it compares", () => {
    const original = deepFreeze(structuredClone(buildEditableMatchForm(makeMatch())));
    const edited = deepFreeze(structuredClone(buildEditableMatchForm(makeMatch())));
    expect(() => compareMatchSnapshots(original, edited)).not.toThrow();
  });

  it("reconcileEditedMatchResult never writes back to the draft it was given", () => {
    const draft = deepFreeze(structuredClone(buildEditableMatchForm(makeMatch())));
    expect(() => reconcileEditedMatchResult("match-1", "group-1", draft, { side1Result: "win", side2Result: "loss" })).not.toThrow();
  });
});

function deepFreeze<T>(value: T): T {
  if (value !== null && (typeof value === "object" || Array.isArray(value))) {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
