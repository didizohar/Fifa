import { colors } from "../theme";

export interface RankTone {
  color: string;
  background: string;
}

const TOP_RANK_TONE: Record<1 | 2 | 3, RankTone> = {
  1: { color: colors.gold, background: colors.goldSubtle },
  2: { color: colors.silver, background: colors.silverSubtle },
  3: { color: colors.bronze, background: colors.bronzeSubtle },
};

/**
 * Every ranking display (Podium, RankingRow, League Table, Season standings)
 * marks 1st/2nd/3rd with the same restrained gold/silver/bronze tint instead
 * of a medal glyph -- one place decides that treatment so it can't drift
 * between screens.
 */
export function getTopRankTone(rank: number): RankTone | null {
  return rank >= 1 && rank <= 3 ? TOP_RANK_TONE[rank as 1 | 2 | 3] : null;
}
