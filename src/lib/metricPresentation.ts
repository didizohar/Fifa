/**
 * Turns a raw "current vs previous" pair into a direction + significance +
 * color tone, so every trend/metric card in the app can show a
 * self-explanatory arrow and color instead of a bare, unexplained number.
 * Deliberately has no i18n/formatting opinions -- the UI composes the
 * actual sentence via useTranslation()'s t(key, params), same as every
 * other piece of derived text in this app.
 */

export type ChangeDirection = "up" | "down" | "flat";
export type ChangeSignificance = "significant" | "insignificant";

export interface MetricChange {
  direction: ChangeDirection;
  significance: ChangeSignificance;
  /** null only when there's no previous value to compare against at all. */
  absoluteChange: number | null;
  /** null when previous is null or 0 (a percentage change from zero is undefined). */
  percentChange: number | null;
}

export interface DescribeMetricChangeOptions {
  /** Minimum |percentChange| (in percentage points, e.g. 5 = 5%) to call the change "significant" when a percent change is computable. Default 5. */
  significantPercentThreshold?: number;
  /** Minimum |absoluteChange| to call it "significant" when a percent change can't be computed (previous is null or 0). Default: any nonzero change. */
  significantAbsoluteThreshold?: number;
}

/**
 * Compares `current` to `previous`. `previous: null` means "no comparable
 * previous period" (e.g. no matches last month) -- distinct from a real
 * previous value of 0, which still supports an absolute (if not percent)
 * comparison.
 */
export function describeMetricChange(current: number, previous: number | null, options: DescribeMetricChangeOptions = {}): MetricChange {
  const { significantPercentThreshold = 5, significantAbsoluteThreshold = 0 } = options;

  if (previous === null) {
    return { direction: "flat", significance: "insignificant", absoluteChange: null, percentChange: null };
  }

  const absoluteChange = current - previous;
  const percentChange = previous === 0 ? null : (absoluteChange / Math.abs(previous)) * 100;
  const direction: ChangeDirection = absoluteChange > 0 ? "up" : absoluteChange < 0 ? "down" : "flat";

  const significance: ChangeSignificance =
    percentChange !== null
      ? Math.abs(percentChange) >= significantPercentThreshold
        ? "significant"
        : "insignificant"
      : Math.abs(absoluteChange) > significantAbsoluteThreshold
        ? "significant"
        : "insignificant";

  return { direction, significance, absoluteChange, percentChange };
}

export type MetricChangeTone = "positive" | "negative" | "neutral";

/**
 * "positive"/"negative"/"neutral" for a change -- never positive/negative
 * for an insignificant or flat change (message: "avoid showing red/green
 * if the change is insignificant"). `invert` is for metrics where a
 * decrease is the good outcome (goals conceded, losing streak length).
 */
export function metricChangeTone(change: MetricChange, invert = false): MetricChangeTone {
  if (change.significance === "insignificant" || change.direction === "flat") return "neutral";
  const isUp = change.direction === "up";
  const isGood = invert ? !isUp : isUp;
  return isGood ? "positive" : "negative";
}

/** Maps a tone to this app's existing win/loss/draw palette (green/red/yellow) -- no new colors introduced. */
export function metricChangeColorKey(tone: MetricChangeTone): "win" | "loss" | "draw" {
  if (tone === "positive") return "win";
  if (tone === "negative") return "loss";
  return "draw";
}
