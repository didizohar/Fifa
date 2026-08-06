import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useClubVersions } from "../hooks/useClubVersions";
import { useNationalTeamsPreference } from "../hooks/useNationalTeamsPreference";
import { useQuickDrawPoolPreference } from "../hooks/useQuickDrawPoolPreference";
import { filterClubsByPool, type ClubPoolMode } from "../lib/clubPools";
import { filterClubVersionsForRandomGeneration } from "../lib/clubRepository";
import { useTranslation } from "../lib/i18n";
import { assignRandomClubs, filterValidClubVersions } from "../lib/random/clubs";
import type { ChipOption } from "./AppChipGroup";
import type { ClubVersion } from "../lib/types/database";
import { Button } from "./Button";
import { colors, spacing, typography } from "../theme";
import { AppChipGroup } from "./AppChipGroup";
import { Card } from "./Card";
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
 */
export function QuickClubDrawCard({ groupId, gameVersionId }: QuickClubDrawCardProps) {
  const { t } = useTranslation();
  const { data: clubVersions } = useClubVersions(gameVersionId ?? undefined);
  const { includeNationalTeams } = useNationalTeamsPreference(groupId);
  const { pool, setPool } = useQuickDrawPoolPreference(groupId);
  const [result, setResult] = useState<{ clubA: ClubVersion; clubB: ClubVersion } | null>(null);
  const [drawKey, setDrawKey] = useState(0);
  // "general" = fewer than 2 eligible clubs overall; "pool" = enough clubs
  // overall, but fewer than 2 in the selected pool. Kept distinct so the
  // message never implies switching pools would help when it wouldn't.
  const [failReason, setFailReason] = useState<"general" | "pool" | null>(null);

  const poolOptions = useMemo<ChipOption<Exclude<ClubPoolMode, "random">>[]>(
    () => [
      { id: "large", label: t("home.quickClubDrawPoolLarge") },
      { id: "small", label: t("home.quickClubDrawPoolSmall") },
    ],
    [t],
  );

  const draw = () => {
    const validPool = filterValidClubVersions(filterClubVersionsForRandomGeneration(clubVersions ?? [], { includeNationalTeams }));
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

      <AppChipGroup
        mode="single"
        options={poolOptions}
        value={pool}
        onChange={setPool}
        accessibilityLabel={t("home.quickClubDrawTitle")}
        style={styles.chipRow}
      />

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
    gap: spacing.sm,
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
