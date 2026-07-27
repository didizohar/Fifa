import { buildMatchPrefillParams, validateMatchPrefill } from "../src/lib/matchPrefill";

const availablePlayerIds = ["p1", "p2", "p3", "p4"];
const availableClubVersionIds = ["c1", "c2"];

describe("buildMatchPrefillParams", () => {
  it("comma-joins player ids per side and includes club ids when clubs were drawn", () => {
    const params = buildMatchPrefillParams(
      "doubles",
      [
        [{ id: "p1" }, { id: "p2" }],
        [{ id: "p3" }, { id: "p4" }],
      ],
      [{ id: "c1" }, { id: "c2" }],
    );
    expect(params).toEqual({
      matchType: "doubles",
      side1Players: "p1,p2",
      side2Players: "p3,p4",
      side1Club: "c1",
      side2Club: "c2",
    });
  });

  it("omits club params when no clubs were drawn yet", () => {
    const params = buildMatchPrefillParams("singles", [[{ id: "p1" }], [{ id: "p2" }]], null);
    expect(params.side1Club).toBeUndefined();
    expect(params.side2Club).toBeUndefined();
  });
});

describe("validateMatchPrefill", () => {
  it("passes through a fully valid singles prefill", () => {
    const result = validateMatchPrefill(
      { matchType: "singles", side1Players: "p1", side2Players: "p2", side1Club: "c1", side2Club: "c2" },
      availablePlayerIds,
      availableClubVersionIds,
    );
    expect(result).toEqual({
      matchType: "singles",
      side1PlayerIds: ["p1"],
      side2PlayerIds: ["p2"],
      side1ClubId: "c1",
      side2ClubId: "c2",
    });
  });

  it("passes through a fully valid doubles prefill", () => {
    const result = validateMatchPrefill(
      { matchType: "doubles", side1Players: "p1,p2", side2Players: "p3,p4", side1Club: "c1", side2Club: "c2" },
      availablePlayerIds,
      availableClubVersionIds,
    );
    expect(result?.side1PlayerIds).toEqual(["p1", "p2"]);
    expect(result?.side2PlayerIds).toEqual(["p3", "p4"]);
  });

  it("returns null for an unrecognized match type", () => {
    expect(validateMatchPrefill({ matchType: "triples" }, availablePlayerIds, availableClubVersionIds)).toBeNull();
  });

  it("drops a side whose player count doesn't match the match type", () => {
    const result = validateMatchPrefill(
      { matchType: "singles", side1Players: "p1,p2", side2Players: "p3" },
      availablePlayerIds,
      availableClubVersionIds,
    );
    expect(result?.side1PlayerIds).toEqual([]);
    expect(result?.side2PlayerIds).toEqual(["p3"]);
  });

  it("drops a side containing a player id that no longer exists in the roster", () => {
    const result = validateMatchPrefill(
      { matchType: "singles", side1Players: "p1", side2Players: "ghost" },
      availablePlayerIds,
      availableClubVersionIds,
    );
    expect(result?.side1PlayerIds).toEqual(["p1"]);
    expect(result?.side2PlayerIds).toEqual([]);
  });

  it("drops both sides when the same player appears on both", () => {
    const result = validateMatchPrefill(
      { matchType: "singles", side1Players: "p1", side2Players: "p1" },
      availablePlayerIds,
      availableClubVersionIds,
    );
    expect(result?.side1PlayerIds).toEqual([]);
    expect(result?.side2PlayerIds).toEqual([]);
  });

  it("nulls out a club id that isn't in the currently loaded club list, without affecting the other side", () => {
    const result = validateMatchPrefill(
      { matchType: "singles", side1Players: "p1", side2Players: "p2", side1Club: "c1", side2Club: "gone" },
      availablePlayerIds,
      availableClubVersionIds,
    );
    expect(result?.side1ClubId).toBe("c1");
    expect(result?.side2ClubId).toBeNull();
  });

  it("defaults missing player/club fields to empty/null rather than throwing", () => {
    const result = validateMatchPrefill({ matchType: "singles" }, availablePlayerIds, availableClubVersionIds);
    expect(result).toEqual({
      matchType: "singles",
      side1PlayerIds: [],
      side2PlayerIds: [],
      side1ClubId: null,
      side2ClubId: null,
    });
  });
});
