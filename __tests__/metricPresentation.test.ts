import { describeMetricChange, metricChangeColorKey, metricChangeTone } from "../src/lib/metricPresentation";

describe("describeMetricChange", () => {
  it("reports null everything when there is no previous value at all", () => {
    expect(describeMetricChange(68, null)).toEqual({ direction: "flat", significance: "insignificant", absoluteChange: null, percentChange: null });
  });

  it("computes an exact absolute and percent change for an increase", () => {
    const change = describeMetricChange(68, 56);
    expect(change.direction).toBe("up");
    expect(change.absoluteChange).toBe(12);
    expect(change.percentChange).toBeCloseTo((12 / 56) * 100, 5);
  });

  it("computes an exact absolute and percent change for a decrease", () => {
    const change = describeMetricChange(40, 60);
    expect(change.direction).toBe("down");
    expect(change.absoluteChange).toBe(-20);
    expect(change.percentChange).toBeCloseTo((-20 / 60) * 100, 5);
  });

  it("is flat with zero absolute change when current equals previous", () => {
    const change = describeMetricChange(50, 50);
    expect(change.direction).toBe("flat");
    expect(change.absoluteChange).toBe(0);
    expect(change.percentChange).toBe(0);
  });

  it("cannot compute a percent change from a previous value of exactly 0, but still reports the absolute change", () => {
    const change = describeMetricChange(5, 0);
    expect(change.absoluteChange).toBe(5);
    expect(change.percentChange).toBeNull();
  });

  it("marks a change significant when |percentChange| meets the default 5% threshold", () => {
    expect(describeMetricChange(63, 60).significance).toBe("significant"); // +5%
    expect(describeMetricChange(62, 60).significance).toBe("insignificant"); // +3.33%
  });

  it("respects a custom significantPercentThreshold", () => {
    expect(describeMetricChange(65, 60, { significantPercentThreshold: 10 }).significance).toBe("insignificant"); // +8.3%
    expect(describeMetricChange(70, 60, { significantPercentThreshold: 10 }).significance).toBe("significant"); // +16.7%
  });

  it("falls back to the absolute threshold when previous is 0 (percent change undefined)", () => {
    expect(describeMetricChange(1, 0, { significantAbsoluteThreshold: 2 }).significance).toBe("insignificant");
    expect(describeMetricChange(3, 0, { significantAbsoluteThreshold: 2 }).significance).toBe("significant");
  });
});

describe("metricChangeTone", () => {
  it("is neutral for an insignificant change even if technically 'up'", () => {
    const change = describeMetricChange(61, 60); // +1.67%, below the 5% default threshold
    expect(metricChangeTone(change)).toBe("neutral");
  });

  it("is neutral for a flat change", () => {
    const change = describeMetricChange(50, 50);
    expect(metricChangeTone(change)).toBe("neutral");
  });

  it("is positive for a significant increase by default", () => {
    const change = describeMetricChange(80, 60);
    expect(metricChangeTone(change)).toBe("positive");
  });

  it("is negative for a significant decrease by default", () => {
    const change = describeMetricChange(40, 60);
    expect(metricChangeTone(change)).toBe("negative");
  });

  it("inverts positive/negative for a lower-is-better metric (e.g. goals conceded)", () => {
    const worseChange = describeMetricChange(10, 4); // conceded more -- bad
    const betterChange = describeMetricChange(2, 8); // conceded fewer -- good
    expect(metricChangeTone(worseChange, true)).toBe("negative");
    expect(metricChangeTone(betterChange, true)).toBe("positive");
  });

  it("stays neutral for an insignificant change even when inverted", () => {
    const change = describeMetricChange(61, 60);
    expect(metricChangeTone(change, true)).toBe("neutral");
  });
});

describe("metricChangeColorKey", () => {
  it("maps each tone to the app's existing win/loss/draw palette keys", () => {
    expect(metricChangeColorKey("positive")).toBe("win");
    expect(metricChangeColorKey("negative")).toBe("loss");
    expect(metricChangeColorKey("neutral")).toBe("draw");
  });
});
