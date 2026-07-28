jest.mock("../src/lib/supabase", () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

import { supabase } from "../src/lib/supabase";
import { EditMatchError, processMatch, processMatchEdit } from "../src/lib/matchService";
import type { EditMatchPayload, RecordMatchPayload } from "../src/lib/types/database";

const mockFrom = supabase.from as jest.Mock;
const mockRpc = supabase.rpc as jest.Mock;

const PAYLOAD: RecordMatchPayload = {
  groupId: "group-1",
  gameVersionId: "gv-1",
  matchType: "singles",
  isOvertime: false,
  isPenalties: false,
  sides: [
    { clubVersionId: "cv-1", score: 2, result: "win", playerIds: ["p1"] },
    { clubVersionId: "cv-2", score: 1, result: "loss", playerIds: ["p2"] },
  ],
};

beforeEach(() => {
  mockFrom.mockReset();
  mockRpc.mockReset();
});

describe("processMatch", () => {
  it("returns the match id from a successful record_match call", async () => {
    mockRpc.mockResolvedValueOnce({ data: "match-1", error: null });

    const matchId = await processMatch(PAYLOAD);

    expect(matchId).toBe("match-1");
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it("calls record_match (not the legacy record_match_and_apply_elo) with the exact expected args -- no Elo fields", async () => {
    mockRpc.mockResolvedValueOnce({ data: "match-1", error: null });

    await processMatch(PAYLOAD);

    expect(mockRpc).toHaveBeenCalledWith("record_match", {
      p_group_id: "group-1",
      p_season_id: null,
      p_game_version_id: "gv-1",
      p_match_type: "singles",
      p_is_overtime: false,
      p_is_penalties: false,
      p_screenshot_url: null,
      p_notes: null,
      p_s1_club_version_id: "cv-1",
      p_s1_score: 2,
      p_s1_penalty: null,
      p_s1_result: "win",
      p_s1_players: ["p1"],
      p_s2_club_version_id: "cv-2",
      p_s2_score: 1,
      p_s2_penalty: null,
      p_s2_result: "loss",
      p_s2_players: ["p2"],
    });
  });

  it("never reads player ratings -- there is no Elo computation in this path", async () => {
    mockRpc.mockResolvedValueOnce({ data: "match-1", error: null });

    await processMatch(PAYLOAD);

    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("surfaces RPC errors without retrying (no Elo concurrency conflicts to retry for)", async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: "23505", message: "duplicate" } });

    await expect(processMatch(PAYLOAD)).rejects.toThrow(/duplicate/);
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });
});

const EDIT_PAYLOAD: EditMatchPayload = {
  matchId: "match-1",
  groupId: "group-1",
  playedAt: "2026-04-01T20:15:00.000Z",
  matchType: "singles",
  isOvertime: false,
  isPenalties: false,
  notes: "updated notes",
  sides: [
    { clubVersionId: "cv-1", score: 4, result: "win", playerIds: ["p1"] },
    { clubVersionId: "cv-2", score: 1, result: "loss", playerIds: ["p2"] },
  ],
};

describe("processMatchEdit", () => {
  it("returns the match id and calls update_match with the exact expected RPC args", async () => {
    mockRpc.mockResolvedValueOnce({ data: "match-1", error: null });

    const matchId = await processMatchEdit(EDIT_PAYLOAD);

    expect(matchId).toBe("match-1");
    expect(mockRpc).toHaveBeenCalledWith("update_match", {
      p_match_id: "match-1",
      p_group_id: "group-1",
      p_played_at: "2026-04-01T20:15:00.000Z",
      p_match_type: "singles",
      p_is_overtime: false,
      p_is_penalties: false,
      p_notes: "updated notes",
      p_s1_club_version_id: "cv-1",
      p_s1_score: 4,
      p_s1_penalty: null,
      p_s1_result: "win",
      p_s1_players: ["p1"],
      p_s2_club_version_id: "cv-2",
      p_s2_score: 1,
      p_s2_penalty: null,
      p_s2_result: "loss",
      p_s2_players: ["p2"],
    });
  });

  it("maps a P0002 error to EditMatchError with code 'not_found', without leaking the raw Postgres message as the code", async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: "P0002", message: "Match not found" } });

    await expect(processMatchEdit(EDIT_PAYLOAD)).rejects.toMatchObject({ code: "not_found" });
  });

  it("maps a 42501 error to EditMatchError with code 'permission_denied'", async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "Not authorized to edit this match" } });

    let caught: unknown;
    try {
      await processMatchEdit(EDIT_PAYLOAD);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(EditMatchError);
    expect((caught as EditMatchError).code).toBe("permission_denied");
  });

  it("maps any other error code to 'unknown'", async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: "23505", message: "duplicate" } });

    await expect(processMatchEdit(EDIT_PAYLOAD)).rejects.toMatchObject({ code: "unknown" });
  });

  it("does not touch player ratings -- update_match is the only call made", async () => {
    mockRpc.mockResolvedValueOnce({ data: "match-1", error: null });

    await processMatchEdit(EDIT_PAYLOAD);

    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });
});
