import { clubKeys, determineAffectedQueries, groupKeys, matchKeys, playerKeys } from "../src/lib/queryClient";

describe("determineAffectedQueries", () => {
  it("returns exactly the query key prefixes a match edit can affect", () => {
    const keys = determineAffectedQueries("group-1", "match-1");
    expect(keys).toEqual([
      playerKeys.list("group-1"),
      matchKeys.list("group-1"),
      matchKeys.groupHistory("group-1"),
      matchKeys.stats("group-1"),
      matchKeys.detail("match-1"),
      ["matches", "records"],
      ["matches", "history"],
    ]);
  });

  it("returns prefixes (not fully-specified keys) for per-player queries, so any player id combination invalidates", () => {
    const keys = determineAffectedQueries("group-1", "match-1");
    const recordsPrefix = keys.find((k) => k[0] === "matches" && k[1] === "records");
    const historyPrefix = keys.find((k) => k[0] === "matches" && k[1] === "history");
    expect(recordsPrefix).toEqual(["matches", "records"]);
    expect(historyPrefix).toEqual(["matches", "history"]);
  });

  it("scopes group-wide keys to the given groupId, not some other group", () => {
    const keys = determineAffectedQueries("group-1", "match-1");
    expect(keys).not.toContainEqual(playerKeys.list("group-2"));
    expect(keys).not.toContainEqual(matchKeys.list("group-2"));
  });

  it("does not touch unrelated query families (groups, club versions)", () => {
    const keys = determineAffectedQueries("group-1", "match-1");
    expect(keys).not.toContainEqual(groupKeys.mine("user-1"));
    expect(keys).not.toContainEqual(clubKeys.gameVersions);
  });
});
