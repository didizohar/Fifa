import { useRouter } from "expo-router";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { EmptyState } from "../../../src/components/EmptyState";
import { ErrorState } from "../../../src/components/ErrorState";
import { MatchRow } from "../../../src/components/MatchRow";
import { Screen } from "../../../src/components/Screen";
import { SkeletonList } from "../../../src/components/Skeleton";
import { useGroup } from "../../../src/hooks/useGroup";
import { useMatches } from "../../../src/hooks/useMatches";
import { matchSideLabel, formatRelativeDate } from "../../../src/lib/format";
import type { MatchSummary } from "../../../src/lib/matches";
import { colors, spacing, typography } from "../../../src/theme";

export default function HistoryScreen() {
  const router = useRouter();
  const { currentGroupId } = useGroup();
  const { data: matches, isLoading, isError, refetch, isRefetching } = useMatches(currentGroupId, 200);

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Match history</Text>
      </View>

      {isLoading ? (
        <View style={styles.listPadding}>
          <SkeletonList count={6} height={92} />
        </View>
      ) : isError ? (
        <ErrorState message="Couldn't load match history." onRetry={refetch} />
      ) : (
        <FlatList
          data={matches}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listPadding}
          refreshControl={<RefreshControl tintColor={colors.accent} refreshing={isRefetching} onRefresh={refetch} />}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item }) => <HistoryRow match={item} onPress={() => router.push(`/match/${item.id}`)} />}
          ListEmptyComponent={
            <EmptyState
              icon="📋"
              title="No matches recorded"
              message="Once you record a match, it'll show up here."
              actionLabel="Record match"
              onAction={() => router.push("/record-match")}
            />
          }
        />
      )}
    </Screen>
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  title: {
    ...typography.title,
  },
  listPadding: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
});
