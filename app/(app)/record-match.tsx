import { useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { Button } from "../../src/components/Button";
import { Card } from "../../src/components/Card";
import { PlayerPicker } from "../../src/components/PlayerPicker";
import { Screen } from "../../src/components/Screen";
import { ScoreStepper } from "../../src/components/ScoreStepper";
import { Skeleton } from "../../src/components/Skeleton";
import { useClubVersions } from "../../src/hooks/useClubVersions";
import { useGroup } from "../../src/hooks/useGroup";
import { usePlayers } from "../../src/hooks/usePlayers";
import { useRecordMatch } from "../../src/hooks/useRecordMatch";
import type { ClubVersion, MatchType } from "../../src/lib/types/database";
import { validateMatchForm } from "../../src/lib/validation/matchForm";
import { colors, radius, spacing, typography } from "../../src/theme";

export default function RecordMatchScreen() {
  const router = useRouter();
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

  const requiredCount = matchType === "singles" ? 1 : 2;
  const scoresLevel = side1Score === side2Score;

  const pickablePlayers = useMemo(
    () => (players ?? []).map((p) => ({ id: p.id, displayName: p.display_name, avatarUrl: p.avatar_url, color: p.custom_color })),
    [players],
  );

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

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.typeToggle}>
          {(["singles", "doubles"] as const).map((type) => (
            <Pressable
              key={type}
              onPress={() => changeMatchType(type)}
              style={[styles.typeButton, matchType === type && styles.typeButtonActive]}
            >
              <Text style={[styles.typeButtonLabel, matchType === type && styles.typeButtonLabelActive]}>
                {type === "singles" ? "1 v 1" : "2 v 2"}
              </Text>
            </Pressable>
          ))}
        </View>

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
  typeToggle: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
  },
  typeButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    alignItems: "center",
  },
  typeButtonActive: {
    backgroundColor: colors.accent,
  },
  typeButtonLabel: {
    ...typography.bodyStrong,
    color: colors.textSecondary,
  },
  typeButtonLabelActive: {
    color: colors.background,
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
    marginRight: spacing.sm,
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
