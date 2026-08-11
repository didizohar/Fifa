const mockMaybeSingle = jest.fn();
const mockSelectAfterUpdate = jest.fn();
const mockInsert = jest.fn();
const mockDeleteEq = jest.fn();
const mockRpc = jest.fn();

// Chainable query-builder mock covering exactly the shapes activeSessions.ts
// actually calls: .select().eq().maybeSingle() (read), .insert() (start),
// .update().eq().eq().select() (CAS write), .delete().eq() (end). Inlined
// directly in the factory (not a helper it calls out to) -- jest.mock's
// factory can't reference out-of-scope variables/functions unless their
// name starts with "mock".
jest.mock("../src/lib/supabase", () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({ maybeSingle: mockMaybeSingle })),
      })),
      insert: mockInsert,
      update: jest.fn(() => ({
        eq: jest.fn(() => ({
          eq: jest.fn(() => ({ select: mockSelectAfterUpdate })),
        })),
      })),
      delete: jest.fn(() => ({ eq: mockDeleteEq })),
    })),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

import {
  endActiveSession,
  fetchActiveSession,
  recordMatchAndAdvanceSession,
  startActiveSession,
  updateActiveSession,
} from "../src/lib/activeSessions";
import type { RecordMatchPayload } from "../src/lib/types/database";
import type { WinnersStaySession } from "../src/lib/rotation/types";

function player(id: string) {
  return { id, display_name: id, avatar_url: null, custom_color: "#000" };
}

function session(overrides: Partial<WinnersStaySession> = {}): WinnersStaySession {
  return {
    id: "session-1",
    groupId: "group-1",
    format: "duo",
    activePlayerIds: ["p1", "p2"],
    currentPairA: { players: [player("p1")], consecutiveMatchesPlayed: 1 },
    currentPairB: { players: [player("p2")], consecutiveMatchesPlayed: 1 },
    pendingRotation: null,
    waitingQueue: [],
    roundNumber: 0,
    startedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastRecordedMatchId: null,
    status: "active",
    longestWinningRun: 1,
    previousSnapshot: null,
    ...overrides,
  };
}

const PAYLOAD: RecordMatchPayload = {
  groupId: "group-1",
  seasonId: null,
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
  jest.clearAllMocks();
});

describe("fetchActiveSession", () => {
  it("returns null when no row exists for the group (no active session)", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(fetchActiveSession("group-1")).resolves.toBeNull();
  });

  it("returns the session and version when a row exists", async () => {
    mockMaybeSingle.mockResolvedValue({ data: { session: session(), version: 4 }, error: null });
    const result = await fetchActiveSession("group-1");
    expect(result).toEqual({ session: session(), version: 4 });
  });

  it("throws on a malformed session payload rather than handing a screen a half-formed object", async () => {
    mockMaybeSingle.mockResolvedValue({ data: { session: { garbage: true }, version: 0 }, error: null });
    await expect(fetchActiveSession("group-1")).rejects.toThrow();
  });

  it("throws on a genuine provider error", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: "network down" } });
    await expect(fetchActiveSession("group-1")).rejects.toThrow("network down");
  });
});

describe("startActiveSession", () => {
  it("inserts at version 0 on success", async () => {
    mockInsert.mockResolvedValue({ error: null });
    await expect(startActiveSession("group-1", session())).resolves.toEqual({ ok: true, version: 0 });
    expect(mockInsert).toHaveBeenCalledWith({ group_id: "group-1", session: session(), version: 0 });
  });

  it("reports 'stale' (not a thrown error) on a unique-violation -- another member already started one for this group", async () => {
    mockInsert.mockResolvedValue({ error: { code: "23505", message: "duplicate key" } });
    await expect(startActiveSession("group-1", session())).resolves.toEqual({ ok: "stale" });
  });

  it("throws on any other error", async () => {
    mockInsert.mockResolvedValue({ error: { code: "42501", message: "permission denied" } });
    await expect(startActiveSession("group-1", session())).rejects.toThrow("permission denied");
  });
});

describe("updateActiveSession (optimistic-concurrency write for non-match mutations)", () => {
  it("succeeds and returns the incremented version when the expected version still matches", async () => {
    mockSelectAfterUpdate.mockResolvedValue({ data: [{ version: 6 }], error: null });
    await expect(updateActiveSession("group-1", 5, session())).resolves.toEqual({ ok: true, version: 6 });
  });

  it("reports 'stale' when the WHERE version=expected clause matched zero rows -- someone else already wrote first", async () => {
    mockSelectAfterUpdate.mockResolvedValue({ data: [], error: null });
    await expect(updateActiveSession("group-1", 5, session())).resolves.toEqual({ ok: "stale" });
  });

  it("throws on a genuine provider error", async () => {
    mockSelectAfterUpdate.mockResolvedValue({ data: null, error: { message: "network down" } });
    await expect(updateActiveSession("group-1", 5, session())).rejects.toThrow("network down");
  });
});

describe("endActiveSession", () => {
  it("deletes the shared row", async () => {
    mockDeleteEq.mockResolvedValue({ error: null });
    await expect(endActiveSession("group-1")).resolves.toBeUndefined();
  });

  it("throws on a genuine provider error", async () => {
    mockDeleteEq.mockResolvedValue({ error: { message: "network down" } });
    await expect(endActiveSession("group-1")).rejects.toThrow("network down");
  });
});

describe("recordMatchAndAdvanceSession (atomic match insert + session advance)", () => {
  it("returns the match id and new version on success", async () => {
    mockRpc.mockResolvedValue({ data: [{ match_id: "m1", new_version: 6 }], error: null });
    const result = await recordMatchAndAdvanceSession({ payload: PAYLOAD, expectedVersion: 5, nextSession: session() });
    expect(result).toEqual({ ok: true, matchId: "m1", version: 6 });
  });

  it("sends the expected version and the precomputed next session through to the RPC", async () => {
    mockRpc.mockResolvedValue({ data: [{ match_id: "m1", new_version: 6 }], error: null });
    await recordMatchAndAdvanceSession({ payload: PAYLOAD, expectedVersion: 5, nextSession: session() });
    expect(mockRpc).toHaveBeenCalledWith(
      "record_match_and_advance_session",
      expect.objectContaining({ p_expected_version: 5, p_next_session: session(), p_group_id: "group-1" }),
    );
  });

  it("maps the P0001 (stale version) error code to { ok: 'stale' } instead of throwing -- this is the concurrency guarantee's client-visible shape", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "This match was already completed by another player." } });
    const result = await recordMatchAndAdvanceSession({ payload: PAYLOAD, expectedVersion: 5, nextSession: session() });
    expect(result).toEqual({ ok: "stale" });
  });

  it("maps the P0002 (no active session) error code to { ok: 'no_session' } -- the session was ended concurrently", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: "P0002", message: "No active session for this group" } });
    const result = await recordMatchAndAdvanceSession({ payload: PAYLOAD, expectedVersion: 5, nextSession: session() });
    expect(result).toEqual({ ok: "no_session" });
  });

  it("throws on any other error (validation, auth, etc.) -- only the two known concurrency codes are swallowed into a typed result", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: "42501", message: "Not a member of this group" } });
    await expect(recordMatchAndAdvanceSession({ payload: PAYLOAD, expectedVersion: 5, nextSession: session() })).rejects.toThrow("Not a member of this group");
  });
});
