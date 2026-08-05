import { formatRelativeDate, matchSideLabel } from "../src/lib/format";

/** Minimal stand-in for the real translator, covering only the keys formatRelativeDate uses. */
const t = (key: string, params?: Record<string, string | number>) => {
  switch (key) {
    case "common.justNow":
      return "just now";
    case "common.minutesAgo":
      return `${params!.count}m ago`;
    case "common.hoursAgo":
      return `${params!.count}h ago`;
    case "common.daysAgo":
      return `${params!.count}d ago`;
    default:
      return key;
  }
};

describe("formatRelativeDate", () => {
  it("uses short relative units under a week old", () => {
    const now = Date.now();
    expect(formatRelativeDate(new Date(now - 10_000).toISOString(), t)).toBe("just now");
    expect(formatRelativeDate(new Date(now - 5 * 60_000).toISOString(), t)).toBe("5m ago");
    expect(formatRelativeDate(new Date(now - 3 * 3_600_000).toISOString(), t)).toBe("3h ago");
    expect(formatRelativeDate(new Date(now - 2 * 86_400_000).toISOString(), t)).toBe("2d ago");
  });

  it("omits the year for an older date within the current year", () => {
    const thisYear = new Date().getFullYear();
    const result = formatRelativeDate(new Date(thisYear, 0, 15).toISOString(), t);
    expect(result).not.toMatch(/\d{4}/);
  });

  it("includes the year for a date from a previous year, so an old achievement doesn't read as recent", () => {
    const lastYear = new Date().getFullYear() - 2;
    const result = formatRelativeDate(new Date(lastYear, 5, 15).toISOString(), t);
    expect(result).toContain(String(lastYear));
  });
});

describe("matchSideLabel", () => {
  it("joins player names with an ampersand", () => {
    expect(matchSideLabel(["Alice", "Bob"])).toBe("Alice & Bob");
    expect(matchSideLabel(["Alice"])).toBe("Alice");
  });

  it("falls back to a placeholder for an empty list", () => {
    expect(matchSideLabel([])).toBe("Unknown");
  });
});
