import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useClubVersions } from "../hooks/useClubVersions";
import { useQuickDrawPoolPreference } from "../hooks/useQuickDrawPoolPreference";
import { filterClubsByPool } from "../lib/clubPools";
import { filterClubVersionsForRandomGeneration } from "../lib/clubRepository";
import { useTranslation } from "../lib/i18n";
import { assignRandomClubs, filterValidClubVersions } from "../lib/random/clubs";
import type { ClubVersion } from "../lib/types/database";
import { Button } from "./Button";
import { colors, spacing, typography } from "../theme";
import { Card } from "./Card";
import { Chip } from "./Chip";
import { ClubBadge } from "./ClubBadge";
import { FadeIn } from "./FadeIn";

interface QuickClubDrawCardProps {
  groupId: string | null;
  gameVersionId: string | null | undefined;
}

/**
 * One-tap "Team A vs Team B" club draw for the dashboard -- deliberately
 * lighter than the full /draw/clubs screen: no player selection, no
 * navigation. Only two pools to choose from (Large/Small -- see
 * clubPools.ts), no per-level picker and no unrestricted-random option;
 * the choice is remembered per group via useQuickDrawPoolPreference.
 * Purely a fun/quick reference (which club to play as), so it never writes
 * to any match or session state.
 *
 * Always excludes national teams, regardless of the group's own
 * Include/Exclude National Teams preference (useNationalTeamsPreference) --
 * unlike every other club-drawing surface (Record Match, the full
 * /draw/clubs screen, QuickMatchCard, ClubPickerSheet), which all still
 * respect that preference unchanged. This is a deliberate, narrower default
 * for the quick one-tap draw specifically, not a global change.
 */
export function QuickClubDrawCard({ groupId, gameVersionId }: QuickClubDrawCardProps) {
  const { t } = useTranslation();
  const { data: clubVersions } = useClubVersions(gameVersionId ?? undefined);
  const { pool, setPool } = useQuickDrawPoolPreference(groupId);
  const [result, setResult] = useState<{ clubA: ClubVersion; clubB: ClubVersion } | null>(null);
  const [drawKey, setDrawKey] = useState(0);
  // "general" = fewer than 2 eligible clubs overall; "pool" = enough clubs
  // overall, but fewer than 2 in the selected pool. Kept distinct so the
  // message never implies switching pools would help when it wouldn't.
  const [failReason, setFailReason] = useState<"general" | "pool" | null>(null);

  const draw = () => {
    // includeNationalTeams is deliberately hardcoded false here, not read
    // from the group's preference -- see the component doc comment above.
    const validPool = filterValidClubVersions(filterClubVersionsForRandomGeneration(clubVersions ?? [], { includeNationalTeams: false }));
    if (validPool.length < 2) {
      setFailReason("general");
      setResult(null);
      return;
    }

    const drawPool = filterClubsByPool(validPool, pool);
    if (drawPool.length < 2) {
      setFailReason("pool");
      setResult(null);
      return;
    }

    const { assignments } = assignRandomClubs(drawPool, 2);
    setFailReason(null);
    setResult({ clubA: assignments[0]!, clubB: assignments[1]! });
    setDrawKey((k) => k + 1);
  };

  return (
    <Card variant="elevated" style={styles.card}>
      <Text style={styles.title}>{t("home.quickClubDrawTitle")}</Text>
      <Text style={styles.hint}>{t("home.quickClubDrawHint")}</Text>

      {/* Two wide pill buttons filling the row (not AppChipGroup's usual
          content-hugging chips, and not a single-piece SegmentedControl) --
          each Chip stretches via flex: 1 while keeping its own pill shape,
          height, radius, and colors untouched. */}
      <View style={styles.chipRow} accessibilityLabel={t("home.quickClubDrawTitle")}>
        <Chip
          label={t("home.quickClubDrawPoolLarge")}
          active={pool === "large"}
          onPress={() => setPool("large")}
          accessibilityRole="radio"
          style={styles.poolChip}
        />
        <Chip
          label={t("home.quickClubDrawPoolSmall")}
          active={pool === "small"}
          onPress={() => setPool("small")}
          accessibilityRole="radio"
          style={styles.poolChip}
        />
      </View>

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
      ) : failReason === "pool" ? (
        <Text style={styles.failedText}>{t("home.quickClubDrawNotEnoughPoolClubs")}</Text>
      ) : failReason === "general" ? (
        <Text style={styles.failedText}>{t("home.quickClubDrawNotEnoughClubs")}</Text>
      ) : null}

      <Button label={t("home.quickClubDrawAction")} onPress={draw} />
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
  chipRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  poolChip: {
    flex: 1,
    justifyContent: "center",
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
});
