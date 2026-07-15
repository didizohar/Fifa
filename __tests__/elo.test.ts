import { calculateNewRatings } from "../src/lib/elo";

describe("calculateNewRatings", () => {
  it("allocates ratings correctly on a normal 1v1 win", () => {
    const { side1New, side2New } = calculateNewRatings("singles", [1000], [1000], 3, 1, false);
    expect(side1New).toBeGreaterThan(1000);
    expect(side2New).toBeLessThan(1000);
  });

  it("scales rewards up with the goal-difference multiplier for heavy wins", () => {
    const normalWin = calculateNewRatings("singles", [1000], [1000], 2, 1, false);
    const heavyWin = calculateNewRatings("singles", [1000], [1000], 5, 1, false);

    const normalDelta = normalWin.side1New - 1000;
    const heavyDelta = heavyWin.side1New - 1000;
    expect(heavyDelta).toBeGreaterThan(normalDelta);
  });

  it("compresses the rating swing for a penalty-shootout win vs a normal win", () => {
    const normalWin = calculateNewRatings("singles", [1000], [1000], 2, 1, false);
    // 1-1 draw, side 1 won on penalties.
    const penaltyWin = calculateNewRatings("singles", [1000], [1000], 1, 1, true, 1);

    expect(penaltyWin.side1New - 1000).toBeGreaterThan(0);
    expect(penaltyWin.side1New - 1000).toBeLessThan(normalWin.side1New - 1000);
  });

  it("treats an undecided draw as a 0.5/0.5 split with no rating change between equal opponents", () => {
    const { side1New, side2New } = calculateNewRatings("singles", [1000], [1000], 1, 1, false);
    expect(side1New).toBe(1000);
    expect(side2New).toBe(1000);
  });

  it("requires penaltyWinnerSide when isPenalties is true and the score is level", () => {
    expect(() => calculateNewRatings("singles", [1000], [1000], 1, 1, true)).toThrow(
      /penaltyWinnerSide/,
    );
  });

  it("averages team ratings for doubles before computing the expected score", () => {
    const { side1New, side2New } = calculateNewRatings("doubles", [1200, 800], [1000, 1000], 2, 1, false);
    // Team averages are both 1000, so this should behave like an even 1v1 win.
    const evenWin = calculateNewRatings("singles", [1000], [1000], 2, 1, false);
    expect(side1New).toBe(evenWin.side1New);
    expect(side2New).toBe(evenWin.side2New);
  });
});
