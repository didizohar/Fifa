jest.mock("../src/lib/supabase", () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

import { supabase } from "../src/lib/supabase";
import { processMatchAndElo } from "../src/lib/matchService";
import type { RecordMatchPayload } from "../src/lib/types/database";

const mockFrom = supabase.from as jest.Mock;
const mockRpc = supabase.rpc as jest.Mock;

const PROFILES = [
  { id: "p1", singles_elo: 1000, doubles_elo: 1000 },
  { id: "p2", singles_elo: 1000, doubles_elo: 1000 },
];

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
  mockFrom.mockReturnValue({
    select: () => ({
      in: () => Promise.resolve({ data: PROFILES, error: null }),
    }),
  });
});

describe("processMatchAndElo", () => {
  it("returns the match id on the first successful RPC call", async () => {
    mockRpc.mockResolvedValueOnce({ data: "match-1", error: null });

    const matchId = await processMatchAndElo(PAYLOAD);

    expect(matchId).toBe("match-1");
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it("retries with freshly re-read ratings after an Elo concurrency conflict", async () => {
    mockRpc
      .mockResolvedValueOnce({ data: null, error: { code: "40001", message: "stale rating" } })
      .mockResolvedValueOnce({ data: "match-2", error: null });

    const matchId = await processMatchAndElo(PAYLOAD);

    expect(matchId).toBe("match-2");
    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(mockFrom).toHaveBeenCalledTimes(2); // ratings re-read before the retry
  });

  it("does not retry and surfaces non-concurrency RPC errors immediately", async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: "23505", message: "duplicate" } });

    await expect(processMatchAndElo(PAYLOAD)).rejects.toThrow(/duplicate/);
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it("gives up after exhausting retries on repeated concurrency conflicts", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: "40001", message: "stale rating" } });

    await expect(processMatchAndElo(PAYLOAD)).rejects.toThrow(/concurrency/i);
    expect(mockRpc).toHaveBeenCalledTimes(3);
  });
});
