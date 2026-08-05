import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState, type ReactNode } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Button } from "../../../src/components/Button";
import { Chip } from "../../../src/components/Chip";
import { EmptyState } from "../../../src/components/EmptyState";
import { ErrorState } from "../../../src/components/ErrorState";
import { ExportButton } from "../../../src/components/ExportButton";
import { ListSeparator } from "../../../src/components/ListSeparator";
import { MatchRow } from "../../../src/components/MatchRow";
import { PlayerPicker } from "../../../src/components/PlayerPicker";
import { Screen } from "../../../src/components/Screen";
import { SegmentedControl } from "../../../src/components/SegmentedControl";
import { SkeletonList } from "../../../src/components/Skeleton";
import { useAuth } from "../../../src/hooks/useAuth";
import { useGroup } from "../../../src/hooks/useGroup";
import { useGroupMatchHistory } from "../../../src/hooks/useMatches";
import { usePlayers } from "../../../src/hooks/usePlayers";
import { matchesToCsv } from "../../../src/lib/csv";
import { matchSideLabel, formatDayLabel, formatRelativeDate } from "../../../src/lib/format";
import { useTranslation } from "../../../src/lib/i18n";
import { DEFAULT_MATCH_FILTERS, distinctClubs, filterMatches, hasActiveFilters, type DateRangeFilter, type MatchFilters } from "../../../src/lib/matchFilters";
import type { MatchSummary } from "../../../src/lib/matches";
import { toPickablePlayer } from "../../../src/lib/players";
import type { MatchType, SideResult } from "../../../src/lib/types/database";
import { canEditMatch } from "../../../src/lib/validation/editMatchForm";
import { colors, radius, spacing, typography } from "../../../src/theme";

type HistoryListItem =
  | { type: "header"; label: string }
  | { type: "match"; match: MatchSummary; isLastInGroup: boolean };

/** Inserts a day-header item before each new calendar day, so the timeline visually clusters by day instead of running as one continuous list. */
function groupMatchesByDay(matches: MatchSummary[]): HistoryListItem[] {
  const items: HistoryListItem[] = [];
  let lastDayKey: string | null = null;

  matches.forEach((match, index) => {
    const dayKey = new Date(match.played_at).toDateString();
    if (dayKey !== lastDayKey) {
      items.push({ type: "header", label: formatDayLabel(match.played_at) });
      lastDayKey = dayKey;
    }
    const next = matches[index + 1];
    const isLastInGroup = !next || new Date(next.played_at).toDateString() !== dayKey;
    items.push({ type: "match", match, isLastInGroup });
  });

  return items;
}

export default function HistoryScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { currentGroupId, currentRole } = useGroup();
  const { user } = useAuth();
  const { data: matches, isLoading, isError, refetch, isRefetching } = useGroupMatchHistory(currentGroupId);
  const players = usePlayers(currentGroupId);

  const [filters, setFilters] = useState<MatchFilters>(DEFAULT_MATCH_FILTERS);
  const [showFilters, setShowFilters] = useState(false);

  const allMatches = matches ?? [];
  const clubs = useMemo(() => distinctClubs(allMatches), [allMatches]);
  const filtered = useMemo(() => filterMatches(allMatches, filters), [allMatches, filters]);
  const filtersActive = hasActiveFilters(filters);
  const listItems = useMemo(() => groupMatchesByDay(filtered), [filtered]);

  const pickablePlayers = useMemo(() => (players.data ?? []).map(toPickablePlayer), [players.data]);
  const opponentChoices = useMemo(() => pickablePlayers.filter((p) => p.id !== filters.playerId), [pickablePlayers, filters.playerId]);

  const dateRangeOptions: { value: DateRangeFilter; label: string }[] = useMemo(
    () => [
      { value: "all", label: t("history.dateRangeAll") },
      { value: "7", label: t("history.dateRange7") },
      { value: "30", label: t("history.dateRange30") },
      { value: "90", label: t("history.dateRange90") },
      { value: "month", label: t("history.dateRangeMonth") },
    ],
    [t],
  );

  const matchTypeOptions: { value: "all" | MatchType; label: string }[] = useMemo(
    () => [
      { value: "all", label: t("history.matchTypeAll") },
      { value: "singles", label: t("history.matchTypeSingles") },
      { value: "doubles", label: t("history.matchTypeDoubles") },
    ],
    [t],
  );

  const resultOptions: { value: "all" | SideResult; label: string; disabled?: boolean }[] = useMemo(
    () => [
      { value: "all", label: t("history.resultAll") },
      { value: "win", label: t("history.resultWin"), disabled: !filters.playerId },
      { value: "loss", label: t("history.resultLoss"), disabled: !filters.playerId },
      { value: "draw", label: t("history.resultDraw") },
    ],
    [filters.playerId, t],
  );

  const clearFilters = () => setFilters(DEFAULT_MATCH_FILTERS);

  return (
    <Screen padded={false} avoidKeyboard>
      <View style={styles.header}>
        <Text style={styles.title}>{t("history.title")}</Text>
        <View style={styles.headerActions}>
          <ExportButton label={t("history.export")} filename={`fc-rival-matches-${Date.now()}.csv`} getCsv={() => matchesToCsv(filtered)} />
          <Pressable
            onPress={() => setShowFilters((s) => !s)}
            style={[styles.filterButton, filtersActive && styles.filterButtonActive]}
            accessibilityRole="button"
            accessibilityLabel={t("history.filtersToggleA11y")}
          >
            <Ionicons name="filter" size={16} color={filtersActive ? colors.accent : colors.textSecondary} />
            <Text style={[styles.filterButtonLabel, filtersActive && styles.filterButtonLabelActive]}>{t("history.filtersLabel")}</Text>
            {filtersActive ? <View style={styles.filterDot} /> : null}
          </Pressable>
        </View>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          value={filters.search}
          onChangeText={(text) => setFilters((f) => ({ ...f, search: text }))}
          placeholder={t("history.searchPlaceholder")}
          placeholderTextColor={colors.textMuted}
          style={styles.search}
          returnKeyType="search"
        />
      </View>

      {showFilters ? (
        <ScrollView style={styles.filterPanel} contentContainerStyle={styles.filterPanelContent} showsVerticalScrollIndicator={false}>
          <FilterSection label={t("history.filterPlayer")}>
            <PlayerPicker
              players={pickablePlayers}
              selectedIds={filters.playerId ? [filters.playerId] : []}
              maxSelected={1}
              onToggle={(id) =>
                setFilters((f) => ({ ...f, playerId: f.playerId === id ? null : id, opponentId: f.playerId === id ? null : f.opponentId }))
              }
            />
          </FilterSection>

          {filters.playerId ? (
            <FilterSection label={t("history.filterOpponent")}>
              <PlayerPicker
                players={opponentChoices}
                selectedIds={filters.opponentId ? [filters.opponentId] : []}
                maxSelected={1}
                onToggle={(id) => setFilters((f) => ({ ...f, opponentId: f.opponentId === id ? null : id }))}
              />
            </FilterSection>
          ) : null}

          {clubs.length > 0 ? (
            <FilterSection label={t("history.filterClub")}>
              <View style={styles.chipWrap}>
                <Chip label={t("history.allClubs")} active={filters.clubId === null} onPress={() => setFilters((f) => ({ ...f, clubId: null }))} />
                {clubs.map((club) => (
                  <Chip
                    key={club.id}
                    label={club.name}
                    active={filters.clubId === club.id}
                    onPress={() => setFilters((f) => ({ ...f, clubId: f.clubId === club.id ? null : club.id }))}
                  />
                ))}
              </View>
            </FilterSection>
          ) : null}

          <FilterSection label={t("history.filterMatchType")}>
            <SegmentedControl options={matchTypeOptions} value={filters.matchType} onChange={(v) => setFilters((f) => ({ ...f, matchType: v }))} />
          </FilterSection>

          <FilterSection label={t("history.filterResult")}>
            <SegmentedControl options={resultOptions} value={filters.result} onChange={(v) => setFilters((f) => ({ ...f, result: v }))} />
            {!filters.playerId ? <Text style={styles.hint}>{t("history.resultHint")}</Text> : null}
          </FilterSection>

          <FilterSection label={t("history.filterDateRange")}>
            <View style={styles.chipWrap}>
              {dateRangeOptions.map((opt) => (
                <Chip
                  key={opt.value}
                  label={opt.label}
                  active={filters.dateRange === opt.value}
                  onPress={() => setFilters((f) => ({ ...f, dateRange: opt.value }))}
                />
              ))}
            </View>
          </FilterSection>

          {filtersActive ? <Button label={t("history.clearFilters")} variant="secondary" onPress={clearFilters} /> : null}
        </ScrollView>
      ) : null}

      {isLoading ? (
        <View style={styles.listPadding}>
          <SkeletonList count={6} height={92} />
        </View>
      ) : isError ? (
        <ErrorState message={t("history.loadError")} onRetry={refetch} />
      ) : (
        <FlatList
          data={listItems}
          keyExtractor={(item) => (item.type === "header" ? `header-${item.label}` : item.match.id)}
          contentContainerStyle={styles.listPadding}
          refreshControl={<RefreshControl tintColor={colors.accent} refreshing={isRefetching} onRefresh={refetch} />}
          ItemSeparatorComponent={ListSeparator}
          renderItem={({ item }) =>
            item.type === "header" ? (
              <Text style={styles.dayHeader}>{item.label}</Text>
            ) : (
              <HistoryRow
                match={item.match}
                isLast={item.isLastInGroup}
                onPress={() => router.push(`/match/${item.match.id}`)}
                canEdit={canEditMatch(currentRole, user?.id, item.match.created_by)}
                onEdit={() => router.push({ pathname: "/record-match", params: { matchId: item.match.id } })}
              />
            )
          }
          ListEmptyComponent={
            filtersActive ? (
              <EmptyState
                icon="🔍"
                title={t("history.filteredEmptyTitle")}
                message={t("history.filteredEmptyMessage")}
                actionLabel={t("history.clearFilters")}
                onAction={clearFilters}
              />
            ) : (
              <EmptyState
                icon="📋"
                title={t("history.emptyTitle")}
                message={t("history.emptyMessage")}
                actionLabel={t("common.recordMatch")}
                onAction={() => router.push("/record-match")}
              />
            )
          }
        />
      )}
    </Screen>
  );
}

function FilterSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.filterSection}>
      <Text style={styles.filterSectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

function HistoryRow({
  match,
  onPress,
  isLast,
  canEdit,
  onEdit,
}: {
  match: MatchSummary;
  onPress: () => void;
  isLast: boolean;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const [s1, s2] = match.sides;
  return (
    <View style={styles.timelineRow}>
      <View style={styles.timelineRail}>
        <View style={styles.timelineDot} />
        {!isLast ? <View style={styles.timelineLine} /> : null}
      </View>
      <View style={styles.timelineContent}>
        <MatchRow
          matchType={match.match_type}
          isPenalties={match.is_penalties}
          playedAtLabel={formatRelativeDate(match.played_at)}
          side1={{
            label: matchSideLabel(s1.players.map((p) => p.display_name)),
            clubName: s1.club?.name ?? t("history.unknownClub"),
            score: s1.score,
            result: s1.result,
          }}
          side2={{
            label: matchSideLabel(s2.players.map((p) => p.display_name)),
            clubName: s2.club?.name ?? t("history.unknownClub"),
            score: s2.score,
            result: s2.result,
          }}
          onPress={onPress}
        />
        {canEdit ? (
          <Pressable
            onPress={onEdit}
            style={styles.editButton}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t("editMatch.entryAction")}
          >
            <Ionicons name="create-outline" size={16} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  title: {
    ...typography.title,
  },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterButtonActive: {
    borderColor: colors.accent,
  },
  filterButtonLabel: {
    ...typography.small,
    color: colors.textSecondary,
  },
  filterButtonLabelActive: {
    color: colors.accent,
    fontWeight: "700",
  },
  filterDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  searchRow: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  search: {
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
  },
  filterPanel: {
    maxHeight: 360,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface,
  },
  filterPanelContent: {
    padding: spacing.md,
    gap: spacing.md,
  },
  filterSection: {
    gap: spacing.sm,
  },
  filterSectionLabel: {
    ...typography.caption,
    fontWeight: "700",
  },
  hint: {
    ...typography.small,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  listPadding: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  timelineRow: {
    flexDirection: "row",
  },
  timelineRail: {
    width: 20,
    alignItems: "center",
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
    marginTop: spacing.md,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: colors.borderSubtle,
    marginTop: 2,
  },
  timelineContent: {
    flex: 1,
  },
  editButton: {
    alignSelf: "flex-end",
    padding: spacing.xs,
    marginTop: -spacing.xs,
  },
  dayHeader: {
    ...typography.eyebrow,
    paddingStart: 20 + spacing.sm,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
});
