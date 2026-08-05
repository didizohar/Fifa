type TFunction = (key: string, params?: Record<string, string | number>) => string;

export function formatRelativeDate(iso: string, t: TFunction): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.round(diffMs / 60_000);

  if (diffMinutes < 1) return t("common.justNow");
  if (diffMinutes < 60) return t("common.minutesAgo", { count: diffMinutes });
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return t("common.hoursAgo", { count: diffHours });
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return t("common.daysAgo", { count: diffDays });

  // Beyond a week, include the year unless it's the current one -- otherwise
  // a date from years ago (e.g. an old achievement unlock) reads as recent.
  const includeYear = date.getFullYear() !== new Date().getFullYear();
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: includeYear ? "numeric" : undefined });
}

/** "Today" / "Yesterday" / "Monday, July 14" (adds the year if it isn't the current one) -- used to group a match list by day. */
export function formatDayLabel(iso: string, t: TFunction): string {
  const date = new Date(iso);
  const today = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(today) - startOfDay(date)) / 86_400_000);

  if (diffDays === 0) return t("common.today");
  if (diffDays === 1) return t("common.yesterday");

  const includeYear = date.getFullYear() !== today.getFullYear();
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: includeYear ? "numeric" : undefined,
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function matchSideLabel(playerNames: string[]): string {
  return playerNames.join(" & ") || "Unknown";
}

/** "3 wins" / "1 loss" / "2 draws" -- the shared phrasing for a current-streak stat wherever it appears (Home, Player profile, CareerSummaryCard). */
export function formatStreakLabel(t: TFunction, result: "win" | "loss" | "draw" | null, count: number): string {
  if (!result || count === 0) return "–";
  const key = result === "win" ? "streakWin" : result === "loss" ? "streakLoss" : "streakDraw";
  return count === 1 ? t(`common.${key}One`) : t(`common.${key}`, { count });
}
