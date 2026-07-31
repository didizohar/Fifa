jest.mock("../src/lib/supabase", () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

import { supabase } from "../src/lib/supabase";
import { archiveActiveSeason, countMatchesForSeason, deleteSeason, fetchSeasons, startNewSeason, suggestNextSeasonName } from "../src/lib/seasons";
import type { Season } from "../src/lib/types/database";

const mockFrom = supabase.from as jest.Mock;
const mockRpc = supabase.rpc as jest.Mock;

beforeEach(() => {
  mockFrom.mockReset();
  mockRpc.mockReset();
});

function season(overrides: Partial<Season> = {}): Season {
  return {
    id: "season-1",
    group_id: "group-1",
    name: "Season 1",
    is_active: true,
    start_date: "2026-01-01T00:00:00.000Z",
    end_date: null,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("suggestNextSeasonName", () => {
  it("suggests \"Season 1\" when the group has never had a season", () => {
    expect(suggestNextSeasonName([])).toBe("Season 1");
  });

  it("suggests the next number after every season the group has ever had, active or archived", () => {
    const seasons = [season({ id: "s1" }), season({ id: "s2", is_active: false })];
    expect(suggestNextSeasonName(seasons)).toBe("Season 3");
  });
});

describe("fetchSeasons", () => {
  it("orders by start_date descending (newest first)", async () => {
    let orderedBy: unknown;
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          order: (col: string, opts: unknown) => {
            orderedBy = { col, opts };
            return Promise.resolve({ data: [season()], error: null });
          },
        }),
      }),
    });

    const result = await fetchSeasons("group-1");
    expect(result).toHaveLength(1);
    expect(orderedBy).toEqual({ col: "start_date", opts: { ascending: false } });
  });

  it("throws a wrapped error on failure", async () => {
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: null, error: { message: "boom" } }) }) }),
    });
    await expect(fetchSeasons("group-1")).rejects.toThrow(/failed to load leagues/i);
  });
});

describe("countMatchesForSeason", () => {
  it("returns the exact count of matches tagged with this season", async () => {
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => Promise.resolve({ count: 7, error: null }) }),
    });
    expect(await countMatchesForSeason("season-1")).toBe(7);
  });

  it("returns 0 when count is null", async () => {
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => Promise.resolve({ count: null, error: null }) }),
    });
    expect(await countMatchesForSeason("season-1")).toBe(0);
  });
});

describe("startNewSeason", () => {
  it("calls the start_new_season RPC with the group id and trimmed name", async () => {
    mockRpc.mockResolvedValue({ data: "new-season-id", error: null });
    const id = await startNewSeason("group-1", "Season 2");
    expect(mockRpc).toHaveBeenCalledWith("start_new_season", { p_group_id: "group-1", p_name: "Season 2" });
    expect(id).toBe("new-season-id");
  });

  it("throws when the RPC reports an error (e.g. non-admin caller)", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "Not authorized to manage this league" } });
    await expect(startNewSeason("group-1", "Season 2")).rejects.toThrow(/not authorized/i);
  });
});

describe("archiveActiveSeason", () => {
  it("sets is_active false and stamps an end_date via a plain client update", async () => {
    let updatePayload: { is_active?: boolean; end_date?: string } = {};
    mockFrom.mockReturnValue({
      update: (payload: typeof updatePayload) => {
        updatePayload = payload;
        return { eq: () => Promise.resolve({ error: null }) };
      },
    });

    await archiveActiveSeason("season-1");
    expect(updatePayload.is_active).toBe(false);
    expect(typeof updatePayload.end_date).toBe("string");
  });
});

describe("deleteSeason", () => {
  it("calls the delete_season RPC with the season and group id", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await deleteSeason("season-1", "group-1");
    expect(mockRpc).toHaveBeenCalledWith("delete_season", { p_season_id: "season-1", p_group_id: "group-1" });
  });

  it("throws when the RPC reports an error", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "Season not found" } });
    await expect(deleteSeason("season-1", "group-1")).rejects.toThrow(/not found/i);
  });

  it("never touches the clubs or club_versions tables -- deleting a competition only ever calls the delete_season RPC", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await deleteSeason("season-1", "group-1");
    expect(mockFrom).not.toHaveBeenCalledWith("clubs");
    expect(mockFrom).not.toHaveBeenCalledWith("club_versions");
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe("archiveActiveSeason (club safety)", () => {
  it("never touches the clubs or club_versions tables -- archiving only ever updates the seasons table", async () => {
    mockFrom.mockReturnValue({ update: () => ({ eq: () => Promise.resolve({ error: null }) }) });
    await archiveActiveSeason("season-1");
    expect(mockFrom).toHaveBeenCalledWith("seasons");
    expect(mockFrom).not.toHaveBeenCalledWith("clubs");
    expect(mockFrom).not.toHaveBeenCalledWith("club_versions");
  });
});
