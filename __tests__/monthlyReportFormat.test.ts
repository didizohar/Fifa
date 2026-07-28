import en from "../src/lib/i18n/translations/en";
import he from "../src/lib/i18n/translations/he";
import type { TranslationKeys } from "../src/lib/i18n/translations/en";
import { formatMonthlyReport } from "../src/lib/monthlyReportFormat";
import type { MonthlyReportData } from "../src/lib/monthlyReport";

function readPath(dict: unknown, path: string): string {
  return path.split(".").reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], dict) as string;
}

/** Minimal stand-in for `useTranslation().t` -- resolves a dot-path against a translation dict and interpolates `{param}` placeholders, same contract the real hook exposes. */
function makeTranslate(dict: TranslationKeys) {
  return (key: string, params?: Record<string, string | number>): string => {
    let value = readPath(dict, key);
    if (params) {
      for (const [name, paramValue] of Object.entries(params)) {
        value = value.replaceAll(`{${name}}`, String(paramValue));
      }
    }
    return value;
  };
}

const baseReport: MonthlyReportData = {
  year: 2026,
  month: 2,
  matchesPlayed: 5,
  awards: [
    { id: "player-of-month", holderName: "Alex", metric: 4 },
    { id: "top-scorer", holderName: "Alex", metric: 9 },
    { id: "most-active", holderName: "Sam", metric: 5 },
    { id: "best-partnership", holderName: "Alex & Sam", metric: 0.75 },
    { id: "most-consistent", holderName: "Sam", metric: 1.2 },
    { id: "most-improved", holderName: "Jordan", metric: 0.25 },
  ],
  recordsBrokenCount: 2,
  playerOfMonthName: "Alex",
  topScorerName: "Alex",
  topScorerGoals: 9,
};

describe("formatMonthlyReport", () => {
  it("produces correct English output, including pluralized award values", () => {
    const formatted = formatMonthlyReport(baseReport, makeTranslate(en), "en");
    expect(formatted.story).toContain("March 2026");
    expect(formatted.story).toContain("5 matches");
    expect(formatted.story).toContain("Alex was Player of the Month.");
    expect(formatted.story).toContain("Alex led the scoring charts with 9 goals.");
    expect(formatted.story).toContain("2 group records were broken.");

    const playerOfMonth = formatted.awards.find((a) => a.id === "player-of-month");
    expect(playerOfMonth).toMatchObject({ label: "Player of the Month", holderName: "Alex", valueLabel: "4 wins" });

    const bestPartnership = formatted.awards.find((a) => a.id === "best-partnership");
    expect(bestPartnership?.valueLabel).toBe("75% win rate");

    const mostConsistent = formatted.awards.find((a) => a.id === "most-consistent");
    expect(mostConsistent?.valueLabel).toBe("±1.2 goal swing");

    const mostImproved = formatted.awards.find((a) => a.id === "most-improved");
    expect(mostImproved?.valueLabel).toBe("+25 pts win rate");
  });

  it("produces correct Hebrew output using Hebrew award labels and month name", () => {
    const formatted = formatMonthlyReport(baseReport, makeTranslate(he), "he");
    expect(formatted.awards.find((a) => a.id === "player-of-month")?.label).toBe("שחקן החודש");
    expect(formatted.awards.find((a) => a.id === "top-scorer")?.label).toBe("מלך השערים");
    expect(formatted.story).toContain("הקבוצה שיחקה 5 משחקים");
    // The month name itself is locale-formatted by Intl, independent of the translation dict.
    expect(formatted.monthLabel.length).toBeGreaterThan(0);
  });

  it("computes the same underlying numbers regardless of which locale formats them", () => {
    const enFormatted = formatMonthlyReport(baseReport, makeTranslate(en), "en");
    const heFormatted = formatMonthlyReport(baseReport, makeTranslate(he), "he");
    // Same award count/order and same holder names -- only the label/value text differs.
    expect(heFormatted.awards.map((a) => a.id)).toEqual(enFormatted.awards.map((a) => a.id));
    expect(heFormatted.awards.map((a) => a.holderName)).toEqual(enFormatted.awards.map((a) => a.holderName));
  });

  it("omits optional story sentences when the underlying facts are missing, without throwing", () => {
    const sparseReport: MonthlyReportData = {
      year: 2026,
      month: 2,
      matchesPlayed: 0,
      awards: [],
      recordsBrokenCount: 0,
      playerOfMonthName: null,
      topScorerName: null,
      topScorerGoals: null,
    };
    const formatted = formatMonthlyReport(sparseReport, makeTranslate(en), "en");
    expect(formatted.story).toContain("0 matches");
    expect(formatted.story).not.toContain("Player of the Month");
    expect(formatted.story).not.toContain("goals");
    expect(formatted.story).not.toContain("record");
    expect(formatted.awards).toEqual([]);
  });

  it("shows a neutral value label for best-partnership when the pair hasn't recorded a result yet", () => {
    const reportWithNullMetric: MonthlyReportData = {
      ...baseReport,
      awards: [{ id: "best-partnership", holderName: "Alex & Sam", metric: null }],
    };
    const formatted = formatMonthlyReport(reportWithNullMetric, makeTranslate(en), "en");
    expect(formatted.awards[0].valueLabel).toBe("-");
  });

  it("passes an archived or deleted player's display name through untouched, regardless of locale", () => {
    const reportWithFallbackName: MonthlyReportData = {
      ...baseReport,
      awards: [{ id: "most-active", holderName: "Deleted player", metric: 3 }],
      playerOfMonthName: null,
      topScorerName: null,
      topScorerGoals: null,
    };
    const enFormatted = formatMonthlyReport(reportWithFallbackName, makeTranslate(en), "en");
    const heFormatted = formatMonthlyReport(reportWithFallbackName, makeTranslate(he), "he");
    expect(enFormatted.awards[0].holderName).toBe("Deleted player");
    expect(heFormatted.awards[0].holderName).toBe("Deleted player");
  });
});
