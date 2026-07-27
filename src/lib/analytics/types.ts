import type { FormEntry, GoalStats, PlayerStats } from "../stats";

/**
 * How far back an analytics view looks. Distinct from matchFilters.ts's
 * DateRangeFilter (which has "month", not "1y") -- analytics ranges are
 * fixed calendar windows meant for charting, not ad-hoc history filtering.
 */
export type AnalyticsRange = "7d" | "30d" | "90d" | "1y" | "all";

/** Bucket width a timeline groups matches into -- chosen per range by resolveTimelineGranularity. */
export type TimelineGranularity = "day" | "week" | "month";

/**
 * One point on any bucketed timeline chart. `value`'s meaning depends on
 * which calculate*Timeline function produced it (win rate 0-1, goal count,
 * match count, rank position, ...) -- kept as a single shape so every
 * timeline can share one chart component downstream.
 */
export interface TimelinePoint {
  /** ISO date (yyyy-mm-dd), local-calendar start of the bucket. */
  bucketStart: string;
  /** Short display label, e.g. "Jul 14" (day/week start) or "Jul 2026" (month). */
  label: string;
  value: number;
  /** How many matches fed into this bucket -- lets a chart distinguish a real 0 from no data. */
  matchesInBucket: number;
}

export interface OpponentPerformance {
  opponentId: string;
  opponentName: string;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number | null;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
}

/** Usage/performance of a single club -- reused for both one player's club breakdown and the whole league's club popularity. */
export interface ClubUsageStat {
  clubId: string;
  clubName: string;
  matchesPlayed: number;
  winRate: number | null;
  /** Share of the considered matches (0-1) that used this club. */
  share: number;
}

export interface RecentFormResult {
  windowSize: number;
  /** Most recent first -- see stats.ts's computeLastNStats. */
  form: FormEntry[];
  stats: PlayerStats;
}

export interface ParticipationRow {
  playerId: string;
  playerName: string;
  matchesPlayed: number;
  /** Share of all considered matches (0-1) this player took part in. */
  share: number;
}

export interface WeekdayActivityRow {
  /** 0 (Sunday) - 6 (Saturday), per Date#getDay(), local time. */
  day: number;
  matches: number;
  share: number;
}

export interface HourlyActivityRow {
  /** 0-23, local time. */
  hour: number;
  matches: number;
  share: number;
}

export interface MonthlyActivityRow {
  year: number;
  /** 0-indexed, per JS Date convention. */
  month: number;
  matches: number;
  totalGoals: number;
}

export interface TopScorerTimelinePoint {
  bucketStart: string;
  label: string;
  /** Null when nobody scored in this bucket. */
  playerId: string | null;
  playerName: string | null;
  goals: number;
}

export interface WinRateEvolutionRow {
  playerId: string;
  playerName: string;
  timeline: TimelinePoint[];
}

/** Single-pass per-bucket breakdown the player *Timeline functions derive from -- avoids re-scanning match history once per metric. */
export interface PerformanceTimelineBucket {
  bucketStart: string;
  label: string;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  goalsFor: number;
  goalsAgainst: number;
}

export interface PlayerAnalyticsSummary {
  playerId: string;
  range: AnalyticsRange;
  matchesConsidered: number;
  overall: PlayerStats;
  singles: PlayerStats;
  doubles: PlayerStats;
  goals: GoalStats;
  recentForm: RecentFormResult;
  winRateTimeline: TimelinePoint[];
  goalsTimeline: TimelinePoint[];
  matchesTimeline: TimelinePoint[];
  goalDifferenceTimeline: TimelinePoint[];
  rankTimeline: TimelinePoint[];
  opponents: OpponentPerformance[];
  clubUsage: ClubUsageStat[];
}

export interface LeagueAnalyticsSummary {
  range: AnalyticsRange;
  matchesConsidered: number;
  playersCount: number;
  totalGoals: number;
  matchesTimeline: TimelinePoint[];
  goalsTimeline: TimelinePoint[];
  averageScoreTimeline: TimelinePoint[];
  averageGoalDifferenceTimeline: TimelinePoint[];
  playerParticipation: ParticipationRow[];
  clubPopularity: ClubUsageStat[];
  weekdayActivity: WeekdayActivityRow[];
  hourlyActivity: HourlyActivityRow[];
  monthlyActivity: MonthlyActivityRow[];
  topScorersTimeline: TopScorerTimelinePoint[];
  winRateEvolution: WinRateEvolutionRow[];
}
