import { useMemo } from "react";
import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Button } from "../../src/components/Button";
import { Card } from "../../src/components/Card";
import { Screen } from "../../src/components/Screen";
import { SkeletonList } from "../../src/components/Skeleton";
import { StatTile } from "../../src/components/StatTile";
import { useGroup } from "../../src/hooks/useGroup";
import { useGroupMatchHistory } from "../../src/hooks/useMatches";
import { usePlayers } from "../../src/hooks/usePlayers";
import { useTranslation } from "../../src/lib/i18n";
import { computeLeagueOverview } from "../../src/lib/leagueStats";
import type { PlayerProfile } from "../../src/lib/types/database";
import { colors, spacing, typography } from "../../src/theme";

const EMPTY_PLAYERS: PlayerProfile[] = [];

/**
 * A real, minimal management hub -- league details plus safe links into the
 * existing player-management screens. Deeper admin actions (resetting the
 * league, merging players, bulk match edits) don't exist yet, so they're
 * called out as coming later rather than exposed as buttons that would do
 * nothing or something unfinished.
 */
export default function LeagueManagementScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { currentGroup } = useGroup();
  const groupId = currentGroup?.id ?? null;

  // includeArchived=true so this screen can show both counts from one query.
  const { data: players, isLoading: isPlayersLoading } = usePlayers(groupId, true);
  const matchHistory = useGroupMatchHistory(groupId);

  const roster = players ?? EMPTY_PLAYERS;
  const matchesPlayed = matchHistory.data?.length ?? 0;
  const overview = useMemo(() => computeLeagueOverview(roster, matchesPlayed), [roster, matchesPlayed]);

  const isLoading = isPlayersLoading || matchHistory.isLoading;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{t("league.title")}</Text>
        {currentGroup ? <Text style={styles.subtitle}>{t("league.subtitle", { name: currentGroup.name })}</Text> : null}

        {isLoading ? (
          <SkeletonList count={3} height={64} />
        ) : (
          <View style={styles.statRow}>
            <StatTile label={t("league.activePlayers")} value={overview.activePlayers} />
            <StatTile label={t("league.archivedPlayers")} value={overview.archivedPlayers} />
            <StatTile label={t("league.matchesPlayed")} value={overview.matchesPlayed} />
          </View>
        )}

        <View style={styles.actions}>
          <Button label={t("league.managePlayers")} onPress={() => router.push("/players")} />
          <Button
            label={t("league.viewArchivedPlayers")}
            variant="secondary"
            onPress={() => router.push({ pathname: "/players", params: { includeArchived: "1" } })}
          />
        </View>

        <Card style={styles.comingSoonCard}>
          <Text style={styles.comingSoonTitle}>{t("league.comingSoonTitle")}</Text>
          <Text style={styles.comingSoonMessage}>{t("league.comingSoonMessage")}</Text>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingVertical: spacing.lg,
    gap: spacing.lg,
  },
  title: {
    ...typography.title,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  statRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  actions: {
    gap: spacing.md,
  },
  comingSoonCard: {
    gap: spacing.xs,
  },
  comingSoonTitle: {
    ...typography.bodyStrong,
  },
  comingSoonMessage: {
    ...typography.small,
    color: colors.textSecondary,
  },
});
