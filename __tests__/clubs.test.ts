jest.mock("../src/lib/supabase", () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { supabase } from "../src/lib/supabase";
import { archiveCustomClub, createCustomClub, updateCustomClub, updateCustomClubRating } from "../src/lib/clubs";

const mockFrom = supabase.from as jest.Mock;

function mockDuplicateCheck(existingNames: string[]) {
  return {
    select: () => ({
      is: () => Promise.resolve({ data: existingNames.map((name) => ({ name })), error: null }),
    }),
  };
}

beforeEach(() => {
  mockFrom.mockReset();
});

describe("createCustomClub", () => {
  it("rejects an empty (or whitespace-only) name before ever touching the database", async () => {
    await expect(createCustomClub({ groupId: "group-1", gameVersionId: "gv-1", name: "   " })).rejects.toThrow(/name is required/i);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("rejects a duplicate name (case/whitespace-insensitive) before inserting", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "clubs") return mockDuplicateCheck(["Real Madrid"]);
      throw new Error(`unexpected table ${table}`);
    });

    await expect(createCustomClub({ groupId: "group-1", gameVersionId: "gv-1", name: "  real   madrid  " })).rejects.toThrow(/already exists/i);
  });

  it("creates a club with only a name -- everything else defaults (3-star rating, null optional fields)", async () => {
    let clubInsertPayload: unknown;
    let versionInsertPayload: unknown;

    mockFrom.mockImplementation((table: string) => {
      if (table === "clubs") {
        return {
          select: () => ({ is: () => Promise.resolve({ data: [], error: null }) }),
          insert: (payload: unknown) => {
            clubInsertPayload = payload;
            return { select: () => ({ single: () => Promise.resolve({ data: { id: "club-1" }, error: null }) }) };
          },
        };
      }
      if (table === "club_versions") {
        return {
          insert: (payload: unknown) => {
            versionInsertPayload = payload;
            return {
              select: () => ({
                single: () => Promise.resolve({ data: { id: "cv-1", club_id: "club-1", game_version_id: "gv-1", star_rating: 3, club: { id: "club-1", name: 'בית"ר ירושלים' } }, error: null }),
              }),
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await createCustomClub({ groupId: "group-1", gameVersionId: "gv-1", name: 'בית"ר ירושלים' });

    expect(clubInsertPayload).toMatchObject({ name: 'בית"ר ירושלים', country: null, league: null, primary_color: null, secondary_color: null, notes: null, group_id: "group-1" });
    expect(versionInsertPayload).toMatchObject({ club_id: "club-1", game_version_id: "gv-1", star_rating: 3 });
    expect(result.id).toBe("cv-1");
  });

  it("uses the caller-supplied star rating instead of the default when given", async () => {
    let versionInsertPayload: unknown;
    mockFrom.mockImplementation((table: string) => {
      if (table === "clubs") {
        return {
          select: () => ({ is: () => Promise.resolve({ data: [], error: null }) }),
          insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: "club-1" }, error: null }) }) }),
        };
      }
      if (table === "club_versions") {
        return {
          insert: (payload: unknown) => {
            versionInsertPayload = payload;
            return { select: () => ({ single: () => Promise.resolve({ data: { id: "cv-1" }, error: null }) }) };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    await createCustomClub({ groupId: "group-1", gameVersionId: "gv-1", name: "Sunday League FC", starRating: 4.5 });
    expect(versionInsertPayload).toMatchObject({ star_rating: 4.5 });
  });
});

describe("updateCustomClub", () => {
  it("rejects renaming to an empty name", async () => {
    await expect(updateCustomClub("club-1", { name: "   " })).rejects.toThrow(/name is required/i);
  });

  it("rejects renaming to a name that duplicates another existing club", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "clubs") return mockDuplicateCheck(["FC Barcelona"]);
      throw new Error(`unexpected table ${table}`);
    });
    await expect(updateCustomClub("club-1", { name: "fc barcelona" })).rejects.toThrow(/already exists/i);
  });

  it("only sends the fields that were actually provided", async () => {
    let updatePayload: unknown;
    mockFrom.mockImplementation((table: string) => {
      if (table === "clubs") {
        return {
          select: () => ({ is: () => Promise.resolve({ data: [], error: null }) }),
          update: (payload: unknown) => {
            updatePayload = payload;
            return { eq: () => Promise.resolve({ error: null }) };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    await updateCustomClub("club-1", { league: "Custom League" });
    expect(updatePayload).toEqual({ league: "Custom League" });
  });
});

describe("updateCustomClubRating", () => {
  it("updates the star rating for a specific club version", async () => {
    let updatePayload: unknown;
    let filteredId: unknown;
    mockFrom.mockImplementation((table: string) => {
      if (table === "club_versions") {
        return {
          update: (payload: unknown) => {
            updatePayload = payload;
            return { eq: (_col: string, value: unknown) => { filteredId = value; return Promise.resolve({ error: null }); } };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    await updateCustomClubRating("cv-1", 4.5);
    expect(updatePayload).toEqual({ star_rating: 4.5 });
    expect(filteredId).toBe("cv-1");
  });
});

describe("archiveCustomClub", () => {
  it("soft-deletes by setting deleted_at, never a hard delete", async () => {
    let updatePayload: { deleted_at?: string } = {};
    mockFrom.mockImplementation((table: string) => {
      if (table === "clubs") {
        return {
          update: (payload: { deleted_at?: string }) => {
            updatePayload = payload;
            return { eq: () => Promise.resolve({ error: null }) };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    await archiveCustomClub("club-1");
    expect(typeof updatePayload.deleted_at).toBe("string");
    expect(Number.isNaN(new Date(updatePayload.deleted_at!).getTime())).toBe(false);
  });
});
