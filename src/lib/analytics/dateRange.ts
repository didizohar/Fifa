import type { MatchSummary } from "../matches";
import type { AnalyticsRange, TimelineGranularity } from "./types";

const MONTH_LABEL = new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" });
const DAY_LABEL = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

/** Parses an ISO date string, returning null instead of an Invalid Date for malformed input. */
export function normalizeMatchDate(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * How far back `range` reaches from `now`, in local time. Null means "all
 * time" -- no cutoff to apply.
 */
export function getAnalyticsRangeStart(range: AnalyticsRange, now: Date): Date | null {
  if (range === "all") return null;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : 365;
  return new Date(now.getTime() - days * 86_400_000);
}

/**
 * Restricts matches to those played on/after the range's cutoff. Matches
 * with an unparseable played_at are dropped rather than crashing the
 * comparison; matches dated after `now` are kept (a range only imposes a
 * lower bound, matching matchFilters.ts's dateRangeCutoff behavior).
 */
export function filterMatchesByRange(matches: MatchSummary[], range: AnalyticsRange, now: Date = new Date()): MatchSummary[] {
  const start = getAnalyticsRangeStart(range, now);
  if (start === null) return matches.filter((m) => normalizeMatchDate(m.played_at) !== null);

  return matches.filter((m) => {
    const played = normalizeMatchDate(m.played_at);
    return played !== null && played.getTime() >= start.getTime();
  });
}

/** The bucket width a timeline should use for a given range -- narrower ranges get finer buckets. */
export function resolveTimelineGranularity(range: AnalyticsRange): TimelineGranularity {
  if (range === "7d" || range === "30d") return "day";
  if (range === "90d") return "week";
  return "month";
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(date: Date): Date {
  const d = startOfDay(date);
  const day = d.getDay(); // 0 (Sun) - 6 (Sat)
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return d;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function bucketStartFor(date: Date, granularity: TimelineGranularity): Date {
  if (granularity === "day") return startOfDay(date);
  if (granularity === "week") return startOfWeek(date);
  return startOfMonth(date);
}

function nextBucketStart(date: Date, granularity: TimelineGranularity): Date {
  const d = new Date(date);
  if (granularity === "day") d.setDate(d.getDate() + 1);
  else if (granularity === "week") d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

function labelFor(date: Date, granularity: TimelineGranularity): string {
  return granularity === "month" ? MONTH_LABEL.format(date) : DAY_LABEL.format(date);
}

/** Earliest parseable played_at among the given matches, or undefined for an empty/all-invalid list. */
export function earliestPlayedDate(matches: MatchSummary[]): Date | undefined {
  let earliest: Date | undefined;
  for (const m of matches) {
    const played = normalizeMatchDate(m.played_at);
    if (played && (!earliest || played < earliest)) earliest = played;
  }
  return earliest;
}

export interface TimelineBucket {
  start: Date;
  /** Exclusive. */
  end: Date;
  bucketStart: string;
  label: string;
}

/**
 * Fixed bucket count per finite range, so "last 30 days" always draws
 * exactly 30 points regardless of what time of day `now` falls at --
 * deriving the first bucket from a raw millisecond subtraction instead
 * would off-by-one whenever `now` isn't exactly midnight.
 */
const RANGE_BUCKET_COUNT: Record<Exclude<AnalyticsRange, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 13,
  "1y": 12,
};

/**
 * Contiguous, gap-free buckets spanning `range` up to `now`, at the
 * granularity resolveTimelineGranularity(range) picks. "all" has no
 * inherent start, so callers pass the earliest match date they know about
 * via `opts.earliestDate`; without one it falls back to one year back so
 * the function still returns something sane for an empty history.
 */
export function createTimelineBuckets(range: AnalyticsRange, now: Date = new Date(), opts?: { earliestDate?: Date }): TimelineBucket[] {
  const granularity = resolveTimelineGranularity(range);
  const lastBucketStart = bucketStartFor(now, granularity);

  let firstBucketStart: Date;
  if (range === "all") {
    const rangeStart = opts?.earliestDate ?? new Date(now.getTime() - 365 * 86_400_000);
    firstBucketStart = bucketStartFor(rangeStart, granularity);
  } else {
    const count = RANGE_BUCKET_COUNT[range];
    firstBucketStart = new Date(lastBucketStart);
    if (granularity === "day") firstBucketStart.setDate(firstBucketStart.getDate() - (count - 1));
    else if (granularity === "week") firstBucketStart.setDate(firstBucketStart.getDate() - (count - 1) * 7);
    else firstBucketStart.setMonth(firstBucketStart.getMonth() - (count - 1));
  }

  const buckets: TimelineBucket[] = [];
  let cursor = firstBucketStart;
  // Safety valve: an absurd earliestDate (e.g. a far-future or corrupt
  // timestamp) shouldn't spin this loop forever.
  let guard = 0;
  while (cursor.getTime() <= lastBucketStart.getTime() && guard < 10_000) {
    const end = nextBucketStart(cursor, granularity);
    buckets.push({ start: new Date(cursor), end, bucketStart: cursor.toISOString().slice(0, 10), label: labelFor(cursor, granularity) });
    cursor = end;
    guard++;
  }
  return buckets;
}
