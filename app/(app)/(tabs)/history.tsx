import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState, type ReactNode } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Button } from "../../../src/components/Button";
import { EmptyState } from "../../../src/components/EmptyState";
import { ErrorState } from "../../../src/components/ErrorState";
import { ExportButton } from "../../../src/components/ExportButton";
import { MatchRow } from "../../../src/components/MatchRow";
import { PlayerPicker } from "../../../src/components/PlayerPicker";
import { Screen } from "../../../src/components/Screen";
import { SegmentedControl } from "../../../src/components/SegmentedControl";
import { SkeletonList } from "../../../src/components/Skeleton";
import { useGroup } from "../../../src/hooks/useGroup";
import { useGroupMatchHistory } from "../../../src/hooks/useMatches";
import { usePlayers } from "../../../src/hooks/usePlayers";
import { matchesToCsv } from "../../../src/lib/csv";
import { matchSideLabel, formatRelativeDate } from "../../../src/lib/format";
import { DEFAULT_MATCH_FILTERS, distinctClubs, filterMatches, hasActiveFilters, type DateRangeFilter, type MatchFilters } from "../../../src/lib/matchFilters";
import type { MatchSummary } from "../../../src/lib/matches";
import type { MatchType, SideResult } from "../../../src/lib/types/database";
import { colors, radius, spacing, typography } from "../../../src/theme";

const DATE_RANGE_OPTIONS: { value: DateRangeFilter; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "month", label: "This month" },
];

const MATCH_TYPE_OPTIONS: { value: "all" | MatchType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "singles", label: "Singles" },
  { value: "doubles", label: "Doubles" },
];

export default function HistoryScreen() {
  const router = useRouter();
  const { currentGroupId } = useGroup();
  const { data: matches, isLoading, isError, refetch, isRefetching } = useGroupMatchHistory(currentGroupId);
  const players = usePlayers(currentGroupId);

  const [filters, setFilters] = useState<MatchFilters>(DEFAULT_MATCH_FILTERS);
  const [showFilters, setShowFilters] = useState(false);

  const allMatches = matches ?? [];
  const clubs = useMemo(() => distinctClubs(allMatches), [allMatches]);
  const filtered = useMemo(() => filterMatches(allMatches, filters), [allMatches, filters]);
  const filtersActive = hasActiveFilters(filters);

  const pickablePlayers = useMemo(
    () => (players.data ?? []).map((p) => ({ id: p.id, displayName: p.display_name, avatarUrl: p.avatar_url, color: p.custom_color })),
    [players.data],
  );
  const opponentChoices = useMemo(() => pickablePlayers.filter((p) => p.id !== filters.playerId), [pickablePlayers, filters.playerId]);

  const resultOptions: { value: "all" | SideResult; label: string; disabled?: boolean }[] = [
    { value: "all", label: "All" },
    { value: "win", label: "Win", disabled: !filters.playerId },
    { value: "loss", label: "Loss", disabled: !filters.playerId },
    { value: "draw", label: "Draw" },
  ];

  const clearFilters = () => setFilters(DEFAULT_MATCH_FILTERS);

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Match history</Text>
        <View style={styles.headerActions}>
          <ExportButton filename={`fc-rival-matches-${Date.now()}.csv`} getCsv={() => matchesToCsv(filtered)} />
          <Pressable
            onPress={() => setShowFilters((s) => !s)}
            style={[styles.filterButton, filtersActive && styles.filterButtonActive]}
            accessibilityRole="button"
            accessibilityLabel="Toggle filters"
          >
            <Ionicons name="filter" size={16} color={filtersActive ? colors.accent : colors.textSecondary} />
            <Text style={[styles.filterButtonLabel, filtersActive && styles.filterButtonLabelActive]}>Filters</Text>
            {filtersActive ? <View style={styles.filterDot} /> : null}
          </Pressable>
        </View>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          value={filters.search}
          onChangeText={(text) => setFilters((f) => ({ ...f, search: text }))}
          placeholder="Search player or club"
          placeholderTextColor={colors.textMuted}
          style={styles.search}
        />
      </View>

      {showFilters ? (
        <ScrollView style={styles.filterPanel} contentContainerStyle={styles.filterPanelContent} showsVerticalScrollIndicator={false}>
          <FilterSection label="Player">
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
            <FilterSection label="Opponent">
              <PlayerPicker
                players={opponentChoices}
                selectedIds={filters.opponentId ? [filters.opponentId] : []}
                maxSelected={1}
                onToggle={(id) => setFilters((f) => ({ ...f, opponentId: f.opponentId === id ? null : id }))}
              />
            </FilterSection>
          ) : null}

          {clubs.length > 0 ? (
            <FilterSection label="Club">
              <View style={styles.chipWrap}>
                <ClubChip label="All" active={filters.clubId === null} onPress={() => setFilters((f) => ({ ...f, clubId: null }))} />
                {clubs.map((club) => (
                  <ClubChip
                    key={club.id}
                    label={club.name}
                    active={filters.clubId === club.id}
                    onPress={() => setFilters((f) => ({ ...f, clubId: f.clubId === club.id ? null : club.id }))}
                  />
                ))}
              </View>
            </FilterSection>
          ) : null}

          <FilterSection label="Match type">
            <SegmentedControl options={MATCH_TYPE_OPTIONS} value={filters.matchType} onChange={(v) => setFilters((f) => ({ ...f, matchType: v }))} />
          </FilterSection>

          <FilterSection label="Result">
            <SegmentedControl options={resultOptions} value={filters.result} onChange={(v) => setFilters((f) => ({ ...f, result: v }))} />
            {!filters.playerId ? <Text style={styles.hint}>Select a player to filter by win or loss.</Text> : null}
          </FilterSection>

          <FilterSection label="Date range">
            <View style={styles.chipWrap}>
              {DATE_RANGE_OPTIONS.map((opt) => (
                <ClubChip
                  key={opt.value}
                  label={opt.label}
                  active={filters.dateRange === opt.value}
                  onPress={() => setFilters((f) => ({ ...f, dateRange: opt.value }))}
                />
              ))}
            </View>
          </FilterSection>

          {filtersActive ? <Button label="Clear filters" variant="secondary" onPress={clearFilters} /> : null}
        </ScrollView>
      ) : null}

      {isLoading ? (
        <View style={styles.listPadding}>
          <SkeletonList count={6} height={92} />
        </View>
      ) : isError ? (
        <ErrorState message="Couldn't load match history." onRetry={refetch} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listPadding}
          refreshControl={<RefreshControl tintColor={colors.accent} refreshing={isRefetching} onRefresh={refetch} />}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item }) => <HistoryRow match={item} onPress={() => router.push(`/match/${item.id}`)} />}
          ListEmptyComponent={
            filtersActive ? (
              <EmptyState
                icon="🔍"
                title="No matches match these filters"
                message="Try widening the date range or clearing a filter."
                actionLabel="Clear filters"
                onAction={clearFilters}
              />
            ) : (
              <EmptyState
                icon="📋"
                title="No matches recorded"
                message="Once you record a match, it'll show up here."
                actionLabel="Record match"
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

function ClubChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]} accessibilityRole="button" accessibilityState={{ selected: active }}>
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function HistoryRow({ match, onPress }: { match: MatchSummary; onPress: () => void }) {
  const [s1, s2] = match.sides;
  return (
    <MatchRow
      matchType={match.match_type}
      isPenalties={match.is_penalties}
      playedAtLabel={formatRelativeDate(match.played_at)}
      side1={{
        label: matchSideLabel(s1.players.map((p) => p.display_name)),
        clubName: s1.club?.name ?? "Unknown club",
        score: s1.score,
        result: s1.result,
      }}
      side2={{
        label: matchSideLabel(s2.players.map((p) => p.display_name)),
        clubName: s2.club?.name ?? "Unknown club",
        score: s2.score,
        result: s2.result,
      }}
      onPress={onPress}
    />
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
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    maxWidth: 160,
  },
  chipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSubtle,
  },
  chipLabel: {
    ...typography.caption,
  },
  chipLabelActive: {
    color: colors.accent,
    fontWeight: "700",
  },
  listPadding: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
});
