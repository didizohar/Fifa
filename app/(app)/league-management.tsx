import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Button } from "../../src/components/Button";
import { Card } from "../../src/components/Card";
import { InfoTooltip } from "../../src/components/InfoTooltip";
import { Screen } from "../../src/components/Screen";
import { SkeletonList } from "../../src/components/Skeleton";
import { StatTile } from "../../src/components/StatTile";
import { TextField } from "../../src/components/TextField";
import { useGroup } from "../../src/hooks/useGroup";
import { useGroupMatchHistory } from "../../src/hooks/useMatches";
import { usePlayers } from "../../src/hooks/usePlayers";
import { useSeasons } from "../../src/hooks/useSeasons";
import { purgeCachedSeasonReport } from "../../src/hooks/useSeasonReport";
import { confirmAction, notify } from "../../src/lib/confirm";
import { formatDateTime } from "../../src/lib/format";
import { useTranslation } from "../../src/lib/i18n";
import { computeLeagueOverview } from "../../src/lib/leagueStats";
import { computeIndividualStandings } from "../../src/lib/leagueStandings";
import { seasonKeys } from "../../src/lib/queryClient";
import { matchesInSeasonWindow } from "../../src/lib/seasonReport";
import { archiveActiveSeason, countMatchesForSeason, deleteSeason, startNewSeason, suggestNextSeasonName } from "../../src/lib/seasons";
import type { PlayerProfile, Season } from "../../src/lib/types/database";
import { colors, spacing, typography } from "../../src/theme";

const EMPTY_PLAYERS: PlayerProfile[] = [];

const BUILT_IN_LEAGUE_CATEGORIES = ["Premier League", "La Liga", "Serie A", "Bundesliga", "Ligue 1", "Eredivisie", "Liga Portugal", "National Teams"];

export default function LeagueManagementScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { currentGroup, currentRole } = useGroup();
  const groupId = currentGroup?.id ?? null;
  const canManageLeague = currentRole === "owner" || currentRole === "admin";

  const { data: players, isLoading: isPlayersLoading } = usePlayers(groupId, true);
  const matchHistory = useGroupMatchHistory(groupId);
  const seasonsQuery = useSeasons(groupId);

  const roster = players ?? EMPTY_PLAYERS;
  const matchesPlayed = matchHistory.data?.length ?? 0;
  const overview = useMemo(() => computeLeagueOverview(roster, matchesPlayed), [roster, matchesPlayed]);

  const seasons = seasonsQuery.data ?? [];
  const activeSeason = seasons.find((s) => s.is_active) ?? null;
  const archivedSeasons = seasons.filter((s) => !s.is_active);

  const [newSeasonName, setNewSeasonName] = useState("");
  const [showStartForm, setShowStartForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isLoading = isPlayersLoading || matchHistory.isLoading;

  const invalidateSeasons = () => {
    if (groupId) queryClient.invalidateQueries({ queryKey: seasonKeys.list(groupId) });
  };

  const openStartForm = () => {
    setNewSeasonName(suggestNextSeasonName(seasons));
    setShowStartForm(true);
  };

  const handleStartNewSeason = async (affectedMatches: number) => {
    if (!groupId || isSubmitting) return;
    const name = newSeasonName.trim() || suggestNextSeasonName(seasons);
    confirmAction(
      t("leagueManagement.startSeasonConfirmTitle"),
      t("leagueManagement.startSeasonConfirmMessage", { name, count: String(affectedMatches) }),
      t("leagueManagement.startSeasonConfirmAction"),
      () => {
        confirmAction(t("leagueManagement.areYouSure"), undefined, t("leagueManagement.startSeasonConfirmAction"), async () => {
          if (isSubmitting) return;
          setIsSubmitting(true);
          try {
            await startNewSeason(groupId, name);
            invalidateSeasons();
            setShowStartForm(false);
            notify(t("leagueManagement.startSeasonSuccess"));
          } catch {
            notify(t("leagueManagement.actionError"));
          } finally {
            setIsSubmitting(false);
          }
        });
      },
    );
  };

  const handleArchiveActive = async () => {
    if (!activeSeason || isSubmitting) return;
    let affected: number;
    try {
      affected = await countMatchesForSeason(activeSeason.id);
    } catch {
      notify(t("leagueManagement.actionError"));
      return;
    }
    confirmAction(
      t("leagueManagement.archiveConfirmTitle"),
      t("leagueManagement.archiveConfirmMessage", { name: activeSeason.name, count: String(affected) }),
      t("leagueManagement.archiveAction"),
      () => {
        confirmAction(t("leagueManagement.areYouSure"), undefined, t("leagueManagement.archiveAction"), async () => {
          if (isSubmitting) return;
          setIsSubmitting(true);
          try {
            await archiveActiveSeason(activeSeason.id);
            invalidateSeasons();
            notify(t("leagueManagement.archiveSuccess"));
          } catch {
            notify(t("leagueManagement.actionError"));
          } finally {
            setIsSubmitting(false);
          }
        });
      },
    );
  };

  /**
   * Both "Delete Competition" (recommended) and "Delete Competition and
   * Data" end up calling the exact same deleteSeason RPC -- in this app's
   * data model, "standings" and "competition-specific statistics" are
   * never stored separately from matches (they're always computed live),
   * so there is no extra stored data for the "and Data" option to remove
   * beyond the season row itself and its in-memory cached report. Neither
   * option, under any circumstance, touches clubs, club_versions, or the
   * matches table's rows -- deleteSeason's own RPC only ever does
   * `UPDATE matches SET season_id = NULL` (never a DELETE on matches) and
   * `DELETE FROM seasons`. purgeAlsoCached is what makes "and Data" a
   * real (if small) distinct action rather than a relabeled duplicate.
   */
  const runDeleteSeason = async (season: Season, purgeAlsoCached: boolean) => {
    if (isSubmitting || !groupId) return;
    setIsSubmitting(true);
    try {
      await deleteSeason(season.id, groupId);
      if (purgeAlsoCached) purgeCachedSeasonReport(season.id);
      invalidateSeasons();
      notify(t("leagueManagement.deleteSuccess"));
    } catch {
      notify(t("leagueManagement.actionError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSeason = async (season: Season, mode: "standard" | "andData") => {
    if (isSubmitting || !groupId) return;
    let matchCount: number;
    try {
      matchCount = await countMatchesForSeason(season.id);
    } catch {
      notify(t("leagueManagement.actionError"));
      return;
    }
    const seasonMatches = matchesInSeasonWindow(matchHistory.data ?? [], season);
    const playerCount = computeIndividualStandings(roster, seasonMatches).length;
    const totalSeasons = (seasonsQuery.data ?? []).length;

    const detailMessage = [
      t("leagueManagement.deleteDetailPlayers", { count: String(playerCount) }),
      t("leagueManagement.deleteDetailMatches", { count: String(matchCount) }),
      t("leagueManagement.deleteDetailSeasons", { count: String(totalSeasons) }),
      t("leagueManagement.deleteDetailCreated", { date: formatDateTime(season.created_at) }),
      "",
      t("leagueManagement.deleteClubSafetyWarning"),
    ].join("\n");

    confirmAction(
      t("leagueManagement.deleteConfirmTitle", { name: season.name }),
      detailMessage,
      mode === "andData" ? t("leagueManagement.deleteAndDataAction") : t("leagueManagement.deleteAction"),
      () => {
        confirmAction(
          t("leagueManagement.areYouSure"),
          t("leagueManagement.deleteFinalWarning"),
          mode === "andData" ? t("leagueManagement.deleteAndDataAction") : t("leagueManagement.deleteAction"),
          () => runDeleteSeason(season, mode === "andData"),
        );
      },
    );
  };

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
          <Button label={t("customClubs.title")} variant="secondary" onPress={() => router.push("/custom-clubs")} />
          <Button label={t("leagueTable.title")} variant="secondary" onPress={() => router.push("/league-table")} />
        </View>

        <Card style={styles.builtInCard}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle}>{t("leagueManagement.builtInCategoriesTitle")}</Text>
            <InfoTooltip
              title={t("leagueManagement.builtInCategoriesTitle")}
              howCalculated={t("leagueManagement.builtInCategoriesInfoHow")}
              matchesIncluded={t("leagueManagement.builtInCategoriesInfoMatches")}
              whenUpdates={t("leagueManagement.builtInCategoriesInfoUpdates")}
              whyUseful={t("leagueManagement.builtInCategoriesInfoWhy")}
            />
          </View>
          <Text style={styles.builtInCategoriesText}>{BUILT_IN_LEAGUE_CATEGORIES.join(" · ")}</Text>
          <Text style={styles.builtInCategoriesNote}>{t("leagueManagement.builtInCategoriesNote")}</Text>
        </Card>

        <Card style={styles.seasonCard}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle}>{t("leagueManagement.competitionLeaguesTitle")}</Text>
            <InfoTooltip
              title={t("leagueManagement.competitionLeaguesTitle")}
              howCalculated={t("leagueManagement.competitionLeaguesInfoHow")}
              matchesIncluded={t("leagueManagement.competitionLeaguesInfoMatches")}
              whenUpdates={t("leagueManagement.competitionLeaguesInfoUpdates")}
              whyUseful={t("leagueManagement.competitionLeaguesInfoWhy")}
            />
          </View>

          {seasonsQuery.isLoading ? (
            <SkeletonList count={1} height={80} />
          ) : activeSeason ? (
            <View style={styles.activeSeasonBlock}>
              <Text style={styles.activeSeasonBadge}>{t("leagueManagement.activeLeagueBadge")}</Text>
              <Text style={styles.activeSeasonName}>{activeSeason.name}</Text>
              <Text style={styles.activeSeasonDate}>{t("leagueManagement.startedOn", { date: formatDateTime(activeSeason.start_date) })}</Text>
              {canManageLeague ? (
                <View style={styles.seasonActionsRow}>
                  <Button label={t("leagueManagement.archiveAction")} variant="secondary" size="sm" onPress={handleArchiveActive} disabled={isSubmitting} />
                  <Button label={t("leagueManagement.resetAction")} variant="secondary" size="sm" onPress={openStartForm} disabled={isSubmitting} />
                </View>
              ) : null}
            </View>
          ) : (
            <View style={styles.activeSeasonBlock}>
              <Text style={styles.noActiveSeasonText}>{t("leagueManagement.noActiveLeague")}</Text>
              {canManageLeague ? <Button label={t("leagueManagement.startNewSeasonAction")} onPress={openStartForm} disabled={isSubmitting} /> : null}
            </View>
          )}

          <Button label={t("seasonHistory.viewSeasonHistory")} variant="secondary" onPress={() => router.push("/season-history")} />

          {showStartForm && canManageLeague ? (
            <View style={styles.startForm}>
              <TextField label={t("leagueManagement.newSeasonNameLabel")} value={newSeasonName} onChangeText={setNewSeasonName} />
              <Text style={styles.startFormHint}>{t("leagueManagement.startSeasonRecommendedHint")}</Text>
              <View style={styles.seasonActionsRow}>
                <Button
                  label={t("leagueManagement.startNewSeasonAction")}
                  size="sm"
                  disabled={isSubmitting}
                  onPress={async () => {
                    let affected = 0;
                    try {
                      if (activeSeason) affected = await countMatchesForSeason(activeSeason.id);
                    } catch {
                      notify(t("leagueManagement.actionError"));
                      return;
                    }
                    handleStartNewSeason(affected);
                  }}
                />
                <Button label={t("common.cancel")} variant="ghost" size="sm" onPress={() => setShowStartForm(false)} />
              </View>
            </View>
          ) : null}

          {archivedSeasons.length > 0 ? (
            <View style={styles.archivedList}>
              <Text style={styles.archivedListTitle}>{t("leagueManagement.archivedLeaguesTitle")}</Text>
              {archivedSeasons.map((season) => (
                <View key={season.id} style={styles.archivedRow}>
                  <View style={styles.archivedRowInfo}>
                    <Text style={styles.archivedRowName}>{season.name}</Text>
                    <Text style={styles.archivedRowDate}>
                      {formatDateTime(season.start_date)} – {season.end_date ? formatDateTime(season.end_date) : "?"}
                    </Text>
                  </View>
                  {canManageLeague ? (
                    <View style={styles.deleteActionsRow}>
                      <Text style={styles.deleteLink} onPress={() => handleDeleteSeason(season, "standard")}>
                        {t("leagueManagement.deleteAction")}
                      </Text>
                      <Text style={styles.deleteLink} onPress={() => handleDeleteSeason(season, "andData")}>
                        {t("leagueManagement.deleteAndDataAction")}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}
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
  builtInCard: {
    gap: spacing.xs,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTitle: {
    ...typography.bodyStrong,
  },
  builtInCategoriesText: {
    ...typography.body,
  },
  builtInCategoriesNote: {
    ...typography.small,
    color: colors.textSecondary,
  },
  seasonCard: {
    gap: spacing.md,
  },
  activeSeasonBlock: {
    gap: spacing.xs,
  },
  activeSeasonBadge: {
    ...typography.small,
    color: colors.accent,
    fontWeight: "700",
  },
  activeSeasonName: {
    ...typography.heading,
  },
  activeSeasonDate: {
    ...typography.small,
    color: colors.textSecondary,
  },
  noActiveSeasonText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  seasonActionsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  startForm: {
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    paddingTop: spacing.md,
  },
  startFormHint: {
    ...typography.small,
    color: colors.textSecondary,
  },
  archivedList: {
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    paddingTop: spacing.md,
  },
  archivedListTitle: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "700",
  },
  archivedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
  },
  archivedRowInfo: {
    gap: 2,
    flex: 1,
  },
  archivedRowName: {
    ...typography.body,
  },
  archivedRowDate: {
    ...typography.small,
    color: colors.textSecondary,
  },
  deleteActionsRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  deleteLink: {
    ...typography.small,
    color: colors.danger,
    fontWeight: "700",
    paddingStart: spacing.md,
  },
});
