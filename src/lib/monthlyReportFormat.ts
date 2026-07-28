import type { Locale } from "./i18n";
import type { MonthlyAwardFact, MonthlyAwardId, MonthlyReportData } from "./monthlyReport";

export interface FormattedMonthlyAward {
  id: MonthlyAwardId;
  label: string;
  holderName: string;
  valueLabel: string;
}

export interface FormattedMonthlyReport {
  monthLabel: string;
  story: string;
  awards: FormattedMonthlyAward[];
}

type Translate = (key: string, params?: Record<string, string | number>) => string;

const AWARD_LABEL_KEYS: Record<MonthlyAwardId, string> = {
  "player-of-month": "monthlyReport.awardPlayerOfMonth",
  "top-scorer": "monthlyReport.awardTopScorer",
  "most-active": "monthlyReport.awardMostActive",
  "best-partnership": "monthlyReport.awardBestPartnership",
  "most-consistent": "monthlyReport.awardMostConsistent",
  "most-improved": "monthlyReport.awardMostImproved",
};

function formatAwardValue(t: Translate, award: MonthlyAwardFact): string {
  switch (award.id) {
    case "player-of-month":
      return t("monthlyReport.winsValue", { count: award.metric ?? 0 });
    case "top-scorer":
      return t("monthlyReport.goalsValue", { count: award.metric ?? 0 });
    case "most-active":
      return t("monthlyReport.matchesValue", { count: award.metric ?? 0 });
    case "best-partnership":
      return award.metric === null ? t("monthlyReport.noValue") : t("monthlyReport.winRateValue", { percent: Math.round(award.metric * 100) });
    case "most-consistent":
      return t("monthlyReport.goalSwingValue", { value: (award.metric ?? 0).toFixed(1) });
    case "most-improved":
      return t("monthlyReport.winRateDeltaValue", { points: Math.round((award.metric ?? 0) * 100) });
  }
}

/**
 * Turns language-independent monthly-report facts into display text. Kept
 * separate from `computeMonthlyReport` so the underlying calculations never
 * change with the selected language, and so no already-translated string
 * ever gets stored back into report/analytics data.
 */
export function formatMonthlyReport(report: MonthlyReportData, t: Translate, locale: Locale): FormattedMonthlyReport {
  const monthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(new Date(report.year, report.month, 1));

  const storyParts = [t("monthlyReport.storyIntro", { month: monthLabel, count: report.matchesPlayed })];
  if (report.playerOfMonthName) storyParts.push(t("monthlyReport.storyPlayerOfMonth", { name: report.playerOfMonthName }));
  if (report.topScorerName && report.topScorerGoals !== null) {
    storyParts.push(t("monthlyReport.storyTopScorer", { name: report.topScorerName, goals: report.topScorerGoals }));
  }
  if (report.recordsBrokenCount > 0) storyParts.push(t("monthlyReport.storyRecordsBroken", { count: report.recordsBrokenCount }));

  const awards = report.awards.map((award) => ({
    id: award.id,
    label: t(AWARD_LABEL_KEYS[award.id]),
    holderName: award.holderName,
    valueLabel: formatAwardValue(t, award),
  }));

  return { monthLabel, story: storyParts.join(" "), awards };
}
