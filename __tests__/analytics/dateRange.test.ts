import {
  createTimelineBuckets,
  earliestPlayedDate,
  filterMatchesByRange,
  getAnalyticsRangeStart,
  groupByBucket,
  normalizeMatchDate,
  resolveTimelineGranularity,
} from "../../src/lib/analytics/dateRange";
import type { MatchSummary } from "../../src/lib/matches";

function makeMatch(playedAt: string): MatchSummary {
  return {
    id: `match-${Math.random()}`,
    match_type: "singles",
    is_overtime: false,
    is_penalties: false,
    notes: null,
    played_at: playedAt,
    sides: [
      { id: `s1-${Math.random()}`, side_number: 1, score: 1, penalty_score: null, result: "win", club: null, players: [{ id: "a", display_name: "a", avatar_url: null, custom_color: "#000" }] },
      { id: `s2-${Math.random()}`, side_number: 2, score: 0, penalty_score: null, result: "loss", club: null, players: [{ id: "b", display_name: "b", avatar_url: null, custom_color: "#000" }] },
    ],
  };
}

describe("normalizeMatchDate", () => {
  it("parses a valid ISO string", () => {
    const date = normalizeMatchDate("2026-07-14T12:00:00.000Z");
    expect(date).not.toBeNull();
    expect(date!.getUTCFullYear()).toBe(2026);
  });

  it("returns null for an unparseable string", () => {
    expect(normalizeMatchDate("not-a-date")).toBeNull();
    expect(normalizeMatchDate("")).toBeNull();
  });
});

describe("getAnalyticsRangeStart", () => {
  const now = new Date(2026, 6, 27); // Jul 27, 2026

  it("returns null for 'all' (no cutoff)", () => {
    expect(getAnalyticsRangeStart("all", now)).toBeNull();
  });

  it.each([
    ["7d", 7],
    ["30d", 30],
    ["90d", 90],
    ["1y", 365],
  ] as const)("returns %s days back for %s", (range, days) => {
    const start = getAnalyticsRangeStart(range, now);
    expect(start!.getTime()).toBe(now.getTime() - days * 86_400_000);
  });
});

describe("resolveTimelineGranularity", () => {
  it("uses day granularity for short ranges", () => {
    expect(resolveTimelineGranularity("7d")).toBe("day");
    expect(resolveTimelineGranularity("30d")).toBe("day");
  });

  it("uses week granularity for 90d", () => {
    expect(resolveTimelineGranularity("90d")).toBe("week");
  });

  it("uses month granularity for long/unbounded ranges", () => {
    expect(resolveTimelineGranularity("1y")).toBe("month");
    expect(resolveTimelineGranularity("all")).toBe("month");
  });
});

describe("filterMatchesByRange", () => {
  const now = new Date(2026, 6, 27, 12);

  it("keeps matches on/after the cutoff and drops older ones", () => {
    const recent = makeMatch(new Date(now.getTime() - 2 * 86_400_000).toISOString());
    const old = makeMatch(new Date(now.getTime() - 40 * 86_400_000).toISOString());
    const result = filterMatchesByRange([recent, old], "30d", now);
    expect(result).toEqual([recent]);
  });

  it("drops matches with an unparseable played_at instead of throwing", () => {
    const bad = makeMatch("not-a-date");
    const good = makeMatch(now.toISOString());
    expect(() => filterMatchesByRange([bad, good], "all", now)).not.toThrow();
    expect(filterMatchesByRange([bad, good], "all", now)).toEqual([good]);
  });

  it("keeps matches dated after `now` -- a range only imposes a lower bound", () => {
    const future = makeMatch(new Date(now.getTime() + 5 * 86_400_000).toISOString());
    expect(filterMatchesByRange([future], "7d", now)).toEqual([future]);
  });

  it("'all' keeps every validly-dated match regardless of age", () => {
    const ancient = makeMatch(new Date(2020, 0, 1).toISOString());
    expect(filterMatchesByRange([ancient], "all", now)).toEqual([ancient]);
  });
});

describe("earliestPlayedDate", () => {
  it("returns undefined for an empty or all-invalid list", () => {
    expect(earliestPlayedDate([])).toBeUndefined();
    expect(earliestPlayedDate([makeMatch("garbage")])).toBeUndefined();
  });

  it("finds the earliest valid date, ignoring invalid ones", () => {
    const early = makeMatch(new Date(2026, 0, 1).toISOString());
    const late = makeMatch(new Date(2026, 5, 1).toISOString());
    const bad = makeMatch("garbage");
    expect(earliestPlayedDate([late, bad, early])?.getTime()).toBe(new Date(2026, 0, 1).getTime());
  });
});

describe("createTimelineBuckets", () => {
  it("produces exactly 7 contiguous daily buckets for '7d', ending on `now`", () => {
    const now = new Date(2026, 6, 27, 15, 30);
    const buckets = createTimelineBuckets("7d", now);
    expect(buckets).toHaveLength(7);
    for (let i = 1; i < buckets.length; i++) {
      expect(buckets[i]!.start.getTime()).toBe(buckets[i - 1]!.end.getTime());
    }
    expect(buckets[buckets.length - 1]!.end.getTime()).toBeGreaterThan(now.getTime());
    expect(buckets[buckets.length - 1]!.start.getTime()).toBeLessThanOrEqual(now.getTime());
  });

  it("produces 12 monthly buckets for '1y'", () => {
    const now = new Date(2026, 6, 27);
    const buckets = createTimelineBuckets("1y", now);
    expect(buckets).toHaveLength(12);
    expect(buckets[0]!.label).toContain("2025");
    expect(buckets[buckets.length - 1]!.label).toContain("2026");
  });

  it("for 'all', spans from the given earliestDate's month to now's month", () => {
    const now = new Date(2026, 6, 27);
    const earliestDate = new Date(2026, 3, 1); // April
    const buckets = createTimelineBuckets("all", now, { earliestDate });
    expect(buckets).toHaveLength(4); // Apr, May, Jun, Jul
  });

  it("for 'all' with no earliestDate, falls back to a sane one-year window instead of crashing", () => {
    const now = new Date(2026, 6, 27);
    expect(() => createTimelineBuckets("all", now)).not.toThrow();
    expect(createTimelineBuckets("all", now).length).toBeGreaterThan(0);
  });

  it("does not spin forever on a pathological earliestDate", () => {
    const now = new Date(2026, 6, 27);
    const farPast = new Date(1000, 0, 1);
    expect(() => createTimelineBuckets("all", now, { earliestDate: farPast })).not.toThrow();
  });

  it("bucketStart reflects each bucket's own LOCAL calendar day, not a UTC-shifted one -- regression test for a bug where toISOString() rolled midnight back a day in zones ahead of UTC", () => {
    const now = new Date(2026, 6, 27, 12);
    for (const bucket of createTimelineBuckets("7d", now)) {
      const expected = `${bucket.start.getFullYear()}-${String(bucket.start.getMonth() + 1).padStart(2, "0")}-${String(bucket.start.getDate()).padStart(2, "0")}`;
      expect(bucket.bucketStart).toBe(expected);
    }
  });
});

describe("groupByBucket", () => {
  const now = new Date(2026, 6, 27, 12);
  const buckets = createTimelineBuckets("7d", now);

  it("assigns each item to exactly the bucket containing its date", () => {
    const items = [{ at: now }, { at: new Date(now.getTime() - 86_400_000) }];
    const groups = groupByBucket(items, buckets, (i) => i.at);
    expect(groups).toHaveLength(buckets.length);
    expect(groups[groups.length - 1]).toEqual([items[0]]);
    expect(groups[groups.length - 2]).toEqual([items[1]]);
  });

  it("omits items with a null date or a date outside every bucket, without throwing", () => {
    const items = [{ at: null as Date | null }, { at: new Date(now.getTime() + 30 * 86_400_000) }];
    expect(() => groupByBucket(items, buckets, (i) => i.at)).not.toThrow();
    const groups = groupByBucket(items, buckets, (i) => i.at);
    expect(groups.flat()).toEqual([]);
  });

  it("matches the naive per-bucket-filter result exactly (correctness check for the binary-search grouping)", () => {
    const dates = Array.from({ length: 50 }, (_, i) => new Date(now.getTime() - i * 43_200_000)); // every 12h back
    const grouped = groupByBucket(dates, buckets, (d) => d);
    const naive = buckets.map((b) => dates.filter((d) => d.getTime() >= b.start.getTime() && d.getTime() < b.end.getTime()));
    expect(grouped).toEqual(naive);
  });
});
