import { useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { Button } from "../../src/components/Button";
import { Card } from "../../src/components/Card";
import { EmptyState } from "../../src/components/EmptyState";
import { PlayerPicker } from "../../src/components/PlayerPicker";
import { Screen } from "../../src/components/Screen";
import { ScoreStepper } from "../../src/components/ScoreStepper";
import { SegmentedControl } from "../../src/components/SegmentedControl";
import { Skeleton } from "../../src/components/Skeleton";
import { useClubVersions } from "../../src/hooks/useClubVersions";
import { useGroup } from "../../src/hooks/useGroup";
import { usePlayers } from "../../src/hooks/usePlayers";
import { useRecordMatch } from "../../src/hooks/useRecordMatch";
import { useTranslation } from "../../src/lib/i18n";
import { type MatchPrefillRouteParams, validateMatchPrefill } from "../../src/lib/matchPrefill";
import { toPickablePlayer } from "../../src/lib/players";
import type { ClubVersion, MatchType } from "../../src/lib/types/database";
import { validateMatchForm } from "../../src/lib/validation/matchForm";
import { colors, radius, spacing, typography } from "../../src/theme";

const MIN_PLAYERS_TO_RECORD = 2;

export default function RecordMatchScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const rawParams = useLocalSearchParams();
  const prefillParams: MatchPrefillRouteParams = {
    matchType: typeof rawParams.matchType === "string" ? rawParams.matchType : undefined,
    side1Players: typeof rawParams.side1Players === "string" ? rawParams.side1Players : undefined,
    side2Players: typeof rawParams.side2Players === "string" ? rawParams.side2Players : undefined,
    side1Club: typeof rawParams.side1Club === "string" ? rawParams.side1Club : undefined,
    side2Club: typeof rawParams.side2Club === "string" ? rawParams.side2Club : undefined,
  };
  const { currentGroup } = useGroup();
  const { data: players, isLoading: playersLoading } = usePlayers(currentGroup?.id ?? null);
  const { data: clubVersions, isLoading: clubsLoading } = useClubVersions(currentGroup?.default_game_version_id);
  const recordMatch = useRecordMatch(currentGroup?.id ?? null);

  const [matchType, setMatchType] = useState<MatchType>("singles");
  const [side1ClubId, setSide1ClubId] = useState<string | null>(null);
  const [side2ClubId, setSide2ClubId] = useState<string | null>(null);
  const [side1PlayerIds, setSide1PlayerIds] = useState<string[]>([]);
  const [side2PlayerIds, setSide2PlayerIds] = useState<string[]>([]);
  const [side1Score, setSide1Score] = useState(0);
  const [side2Score, setSide2Score] = useState(0);
  const [isOvertime, setIsOvertime] = useState(false);
  const [isPenalties, setIsPenalties] = useState(false);
  const [penaltyScore1, setPenaltyScore1] = useState(0);
  const [penaltyScore2, setPenaltyScore2] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [showPrefillBanner, setShowPrefillBanner] = useState(false);

  // Apply a draw-result prefill (see app/(app)/draw/matchup.tsx) exactly once, as soon as
  // the roster/club data needed to re-validate it has loaded -- never on a later refetch,
  // or it would silently stomp on whatever the user has already edited.
  const hasAppliedPrefill = useRef(false);
  useEffect(() => {
    if (hasAppliedPrefill.current || !players || !clubVersions) return;
    if (!prefillParams.matchType) return;
    hasAppliedPrefill.current = true;
    const prefill = validateMatchPrefill(
      prefillParams,
      players.map((p) => p.id),
      clubVersions.map((cv) => cv.id),
    );
    if (!prefill) return;
    setMatchType(prefill.matchType);
    setSide1PlayerIds(prefill.side1PlayerIds);
    setSide2PlayerIds(prefill.side2PlayerIds);
    setSide1ClubId(prefill.side1ClubId);
    setSide2ClubId(prefill.side2ClubId);
    if (prefill.side1PlayerIds.length > 0 || prefill.side2PlayerIds.length > 0 || prefill.side1ClubId || prefill.side2ClubId) {
      setShowPrefillBanner(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, clubVersions]);

  const requiredCount = matchType === "singles" ? 1 : 2;
  const scoresLevel = side1Score === side2Score;

  const pickablePlayers = useMemo(() => (players ?? []).map(toPickablePlayer), [players]);

  const changeMatchType = (type: MatchType) => {
    setMatchType(type);
    setSide1PlayerIds([]);
    setSide2PlayerIds([]);
  };

  const toggleSide1Player = (id: string) => {
    setSide1PlayerIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };
  const toggleSide2Player = (id: string) => {
    setSide2PlayerIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const handleSubmit = async () => {
    if (!currentGroup) return;

    const validation = validateMatchForm(
      {
        matchType,
        side1: { clubVersionId: side1ClubId, playerIds: side1PlayerIds, score: side1Score },
        side2: { clubVersionId: side2ClubId, playerIds: side2PlayerIds, score: side2Score },
        isPenalties,
        penaltyScore1: isPenalties ? penaltyScore1 : null,
        penaltyScore2: isPenalties ? penaltyScore2 : null,
      },
      (players ?? []).map((p) => p.id),
    );

    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }
    setErrors([]);

    try {
      const matchId = await recordMatch.mutateAsync({
        groupId: currentGroup.id,
        gameVersionId: currentGroup.default_game_version_id!,
        matchType,
        isOvertime,
        isPenalties,
        penaltyWinnerSide: validation.penaltyWinnerSide,
        sides: [
          {
            clubVersionId: side1ClubId!,
            score: side1Score,
            penaltyScore: isPenalties ? penaltyScore1 : null,
            result: validation.side1Result,
            playerIds: side1PlayerIds,
          },
          {
            clubVersionId: side2ClubId!,
            score: side2Score,
            penaltyScore: isPenalties ? penaltyScore2 : null,
            result: validation.side2Result,
            playerIds: side2PlayerIds,
          },
        ],
      });
      router.replace(`/match/${matchId}`);
    } catch (e) {
      setErrors([e instanceof Error ? e.message : "Failed to record match."]);
    }
  };

  if (!currentGroup) return null;

  if (!playersLoading && (players ?? []).length < MIN_PLAYERS_TO_RECORD) {
    return (
      <Screen>
        <EmptyState
          icon="🧑‍🤝‍🧑"
          title="Not enough players yet"
          message="A match needs at least two players in the group. Add one, then come back here."
          actionLabel="Add player"
          onAction={() => router.push("/player/new")}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {showPrefillBanner ? (
          <View style={styles.prefillBanner}>
            <Text style={styles.prefillBannerText}>{t("draw.prefillBannerMessage")}</Text>
          </View>
        ) : null}

        <SegmentedControl
          options={[
            { value: "singles" as const, label: "1 v 1" },
            { value: "doubles" as const, label: "2 v 2" },
          ]}
          value={matchType}
          onChange={changeMatchType}
        />

        <Card style={styles.sideCard}>
          <Text style={styles.sideTitle}>Side 1</Text>
          {clubsLoading ? <Skeleton height={40} /> : (
            <ClubSelect clubVersions={clubVersions ?? []} selectedId={side1ClubId} onSelect={setSide1ClubId} />
          )}
          {playersLoading ? <Skeleton height={80} /> : (
            <PlayerPicker
              players={pickablePlayers}
              selectedIds={side1PlayerIds}
              onToggle={toggleSide1Player}
              disabledIds={side2PlayerIds}
              maxSelected={requiredCount}
            />
          )}
          <ScoreStepper label="Score" value={side1Score} onChange={setSide1Score} />
        </Card>

        <Card style={styles.sideCard}>
          <Text style={styles.sideTitle}>Side 2</Text>
          {clubsLoading ? <Skeleton height={40} /> : (
            <ClubSelect clubVersions={clubVersions ?? []} selectedId={side2ClubId} onSelect={setSide2ClubId} />
          )}
          {playersLoading ? <Skeleton height={80} /> : (
            <PlayerPicker
              players={pickablePlayers}
              selectedIds={side2PlayerIds}
              onToggle={toggleSide2Player}
              disabledIds={side1PlayerIds}
              maxSelected={requiredCount}
            />
          )}
          <ScoreStepper label="Score" value={side2Score} onChange={setSide2Score} />
        </Card>

        <Card style={styles.optionsCard}>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Went to overtime</Text>
            <Switch
              value={isOvertime}
              onValueChange={setIsOvertime}
              trackColor={{ false: colors.border, true: colors.accentMuted }}
              thumbColor={colors.textPrimary}
            />
          </View>
          <View style={styles.switchRow}>
            <Text style={[styles.switchLabel, !scoresLevel && styles.switchLabelDisabled]}>
              Decided by penalties
            </Text>
            <Switch
              value={isPenalties && scoresLevel}
              onValueChange={setIsPenalties}
              disabled={!scoresLevel}
              trackColor={{ false: colors.border, true: colors.accentMuted }}
              thumbColor={colors.textPrimary}
            />
          </View>
          {!scoresLevel ? <Text style={styles.hint}>Only available when both sides have the same score.</Text> : null}
          {isPenalties && scoresLevel ? (
            <View style={styles.penaltyRow}>
              <ScoreStepper label="Side 1 pens" value={penaltyScore1} onChange={setPenaltyScore1} max={20} />
              <ScoreStepper label="Side 2 pens" value={penaltyScore2} onChange={setPenaltyScore2} max={20} />
            </View>
          ) : null}
        </Card>

        {errors.length > 0 ? (
          <View style={styles.errorBox}>
            {errors.map((message) => (
              <Text key={message} style={styles.errorText}>• {message}</Text>
            ))}
          </View>
        ) : null}

        <Button label="Save match" onPress={handleSubmit} loading={recordMatch.isPending} />
      </ScrollView>
    </Screen>
  );
}

function ClubSelect({
  clubVersions,
  selectedId,
  onSelect,
}: {
  clubVersions: ClubVersion[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.clubScroll}>
      {clubVersions.map((cv) => (
        <Pressable
          key={cv.id}
          onPress={() => onSelect(cv.id)}
          style={[styles.clubChip, selectedId === cv.id && styles.clubChipSelected]}
          accessibilityRole="button"
          accessibilityLabel={cv.club.name}
          accessibilityState={{ selected: selectedId === cv.id }}
        >
          <Text style={[styles.clubChipLabel, selectedId === cv.id && styles.clubChipLabelSelected]} numberOfLines={1}>
            {cv.club.name}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
    paddingVertical: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  prefillBanner: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentSubtle,
    padding: spacing.md,
  },
  prefillBannerText: {
    ...typography.small,
    color: colors.accent,
    textAlign: "center",
  },
  sideCard: {
    gap: spacing.md,
  },
  sideTitle: {
    ...typography.heading,
  },
  clubScroll: {
    flexGrow: 0,
  },
  clubChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    marginEnd: spacing.sm,
  },
  clubChipSelected: {
    backgroundColor: colors.accentSubtle,
    borderColor: colors.accent,
  },
  clubChipLabel: {
    ...typography.caption,
  },
  clubChipLabelSelected: {
    color: colors.accent,
    fontWeight: "700",
  },
  optionsCard: {
    gap: spacing.md,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  switchLabel: {
    ...typography.body,
  },
  switchLabelDisabled: {
    color: colors.textMuted,
  },
  hint: {
    ...typography.small,
    marginTop: -spacing.xs,
  },
  penaltyRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: spacing.sm,
  },
  errorBox: {
    backgroundColor: colors.dangerSubtle,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
  },
});
