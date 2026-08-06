import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useClubVersions } from "../hooks/useClubVersions";
import { useNationalTeamsPreference } from "../hooks/useNationalTeamsPreference";
import { filterClubVersionsForRandomGeneration } from "../lib/clubRepository";
import { useTranslation } from "../lib/i18n";
import { assignRandomClubs, filterClubsByExactStars, filterValidClubVersions } from "../lib/random/clubs";
import type { ClubVersion } from "../lib/types/database";
import { colors, radius, spacing, typography } from "../theme";
import { AnimatedPressable } from "./AnimatedPressable";
import { Card } from "./Card";
import { ClubBadge } from "./ClubBadge";
import { FadeIn } from "./FadeIn";

interface QuickClubDrawCardProps {
  groupId: string | null;
  gameVersionId: string | null | undefined;
}

type DrawMode = "random" | "stars";

/** Picks the star level with the most eligible clubs (min. 2) so "By Stars" always has its best shot at an exact match without asking the user to choose one. */
function pickBestStarLevel<T extends { star_rating: number }>(pool: readonly T[]): number | null {
  const counts = new Map<number, number>();
  for (const cv of pool) counts.set(cv.star_rating, (counts.get(cv.star_rating) ?? 0) + 1);
  let best: number | null = null;
  let bestCount = 0;
  for (const [level, count] of counts) {
    if (count >= 2 && count > bestCount) {
      best = level;
      bestCount = count;
    }
  }
  return best;
}

/**
 * One-tap "Team A vs Team B" club draw for the dashboard -- deliberately
 * lighter than the full /draw/clubs screen: no player selection, no mode
 * picker beyond Random/By Stars, no navigation. Tapping a button both
 * picks the mode and runs the draw in the same action. Purely a fun/quick
 * reference (which club to play as), so it never writes to any match or
 * session state.
 */
export function QuickClubDrawCard({ groupId, gameVersionId }: QuickClubDrawCardProps) {
  const { t } = useTranslation();
  const { data: clubVersions } = useClubVersions(gameVersionId ?? undefined);
  const { includeNationalTeams } = useNationalTeamsPreference(groupId);
  const [result, setResult] = useState<{ clubA: ClubVersion; clubB: ClubVersion } | null>(null);
  const [drawKey, setDrawKey] = useState(0);
  const [failed, setFailed] = useState(false);

  const draw = (mode: DrawMode) => {
    const pool = filterValidClubVersions(filterClubVersionsForRandomGeneration(clubVersions ?? [], { includeNationalTeams }));
    if (pool.length < 2) {
      setFailed(true);
      setResult(null);
      return;
    }
    const starPool = mode === "stars" ? filterClubsByExactStars(pool, pickBestStarLevel(pool) ?? -1) : pool;
    const drawPool = starPool.length >= 2 ? starPool : pool;
    const { assignments } = assignRandomClubs(drawPool, 2);
    setFailed(false);
    setResult({ clubA: assignments[0]!, clubB: assignments[1]! });
    setDrawKey((k) => k + 1);
  };

  return (
    <Card variant="elevated" style={styles.card}>
      <Text style={styles.title}>{t("home.quickClubDrawTitle")}</Text>
      <Text style={styles.hint}>{t("home.quickClubDrawHint")}</Text>

      {result ? (
        <FadeIn key={drawKey}>
          <View style={styles.resultRow}>
            <View style={styles.teamCol}>
              <Text style={styles.teamLabel}>{t("home.quickClubDrawTeamA")}</Text>
              <ClubBadge name={result.clubA.club.name} starRating={result.clubA.star_rating} />
            </View>
            <Text style={styles.vs}>{t("home.quickClubDrawVs")}</Text>
            <View style={styles.teamCol}>
              <Text style={styles.teamLabel}>{t("home.quickClubDrawTeamB")}</Text>
              <ClubBadge name={result.clubB.club.name} starRating={result.clubB.star_rating} />
            </View>
          </View>
        </FadeIn>
      ) : failed ? (
        <Text style={styles.failedText}>{t("home.quickClubDrawNotEnoughClubs")}</Text>
      ) : null}

      <View style={styles.buttonRow}>
        <AnimatedPressable onPress={() => draw("random")} style={styles.actionButton} accessibilityRole="button" accessibilityLabel={t("draw.clubModeRandom")}>
          <Text style={styles.actionButtonLabel}>{result ? t("home.quickClubDrawAgain") : t("draw.clubModeRandom")}</Text>
        </AnimatedPressable>
        <AnimatedPressable onPress={() => draw("stars")} style={styles.actionButton} accessibilityRole="button" accessibilityLabel={t("home.quickClubDrawByStars")}>
          <Text style={styles.actionButtonLabel}>{t("home.quickClubDrawByStars")}</Text>
        </AnimatedPressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
  },
  title: {
    ...typography.heading,
  },
  hint: {
    ...typography.small,
    color: colors.textSecondary,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  teamCol: {
    flex: 1,
    alignItems: "center",
    gap: spacing.xs,
  },
  teamLabel: {
    ...typography.eyebrow,
  },
  vs: {
    ...typography.bodyStrong,
    color: colors.textMuted,
  },
  failedText: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: "center",
    paddingVertical: spacing.sm,
  },
  buttonRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  actionButtonLabel: {
    ...typography.bodyStrong,
  },
});
