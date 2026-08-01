import { useCallback, useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { Avatar } from "../../../src/components/Avatar";
import { Button } from "../../../src/components/Button";
import { Card } from "../../../src/components/Card";
import { EmptyState } from "../../../src/components/EmptyState";
import { ErrorState } from "../../../src/components/ErrorState";
import { PlayerPicker } from "../../../src/components/PlayerPicker";
import { ResultRevealCard } from "../../../src/components/ResultRevealCard";
import { ScoreStepper } from "../../../src/components/ScoreStepper";
import { Screen } from "../../../src/components/Screen";
import { ShareCopyRow } from "../../../src/components/ShareCopyRow";
import { SkeletonList } from "../../../src/components/Skeleton";
import { useDrawSuspense } from "../../../src/hooks/useDrawSuspense";
import { useGroup } from "../../../src/hooks/useGroup";
import { usePlayers } from "../../../src/hooks/usePlayers";
import { useTranslation } from "../../../src/lib/i18n";
import { toPickablePlayer } from "../../../src/lib/players";
import { sample } from "../../../src/lib/random";
import type { PlayerProfile } from "../../../src/lib/types/database";
import { useRouter } from "expo-router";
import { colors, spacing, typography } from "../../../src/theme";

export default function RandomPlayerDrawScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { currentGroup } = useGroup();
  const [includeArchived, setIncludeArchived] = useState(false);
  const { data: players, isLoading, isError, refetch } = usePlayers(currentGroup?.id ?? null, includeArchived);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [howMany, setHowMany] = useState(1);
  const [drawnPlayers, setDrawnPlayers] = useState<PlayerProfile[] | null>(null);
  const [revealKey, setRevealKey] = useState(0);
  const suspense = useDrawSuspense();

  useEffect(() => {
    setSelectedIds((players ?? []).map((p) => p.id));
    setDrawnPlayers(null);
  }, [players]);

  useEffect(() => {
    if (howMany > selectedIds.length) setHowMany(Math.max(1, selectedIds.length));
  }, [selectedIds, howMany]);

  // useCallback so PlayerPicker's React.memo actually skips re-rendering
  // the roster list on unrelated state changes (howMany, drawn results)
  // -- see src/components/PlayerPicker.tsx.
  const toggleSelection = useCallback((playerId: string) => {
    setSelectedIds((prev) => (prev.includes(playerId) ? prev.filter((id) => id !== playerId) : [...prev, playerId]));
  }, []);

  const draw = () => {
    const eligible = (players ?? []).filter((p) => selectedIds.includes(p.id));
    const result = sample(eligible, howMany);
    suspense.start(() => {
      setDrawnPlayers(result);
      setRevealKey((k) => k + 1);
      AccessibilityInfo.announceForAccessibility(t("draw.resultAnnouncement", { summary: result.map((p) => p.display_name).join(", ") }));
    });
  };

  // Screen/ScrollView below is now ALWAYS mounted -- loading/error/empty
  // states render as its *content*, not as separate early-return trees.
  // See draw/matchup.tsx for the full root-cause writeup: when the loading
  // branch returned a separate <Screen><SkeletonList/></Screen> (a plain
  // View, no ScrollView at all), the real ScrollView only mounted for the
  // first time once data resolved -- often right as the push transition
  // was settling, racing the screen-edge swipe-back gesture for priority
  // and causing scrolling to appear frozen for a moment on real devices.
  const zeroPlayers = !isLoading && !isError && (!players || players.length === 0);

  // players only changes when the roster query refetches -- toggling
  // selection or opening the picker's search box previously re-mapped
  // every player on every render even though the source list hadn't moved.
  const pickablePlayers = useMemo(() => (players ?? []).map(toPickablePlayer), [players]);
  const resultText = drawnPlayers ? `${t("draw.resultTitle")}: ${drawnPlayers.map((p) => p.display_name).join(", ")}` : "";

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <SkeletonList count={5} />
        ) : isError ? (
          <ErrorState onRetry={refetch} />
        ) : zeroPlayers ? (
          <EmptyState
            icon="🎲"
            title={t("draw.zeroPlayers")}
            message={t("draw.zeroPlayersMessage")}
            actionLabel={t("common.addPlayer")}
            onAction={() => router.push("/player/new")}
          />
        ) : (
          <>
        <Card style={styles.section}>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>{t("draw.includeArchived")}</Text>
            <Switch value={includeArchived} onValueChange={setIncludeArchived} />
          </View>

          <Text style={styles.label}>{t("draw.selectPlayers")}</Text>
          <PlayerPicker
            players={pickablePlayers}
            selectedIds={selectedIds}
            onToggle={toggleSelection}
            maxSelected={pickablePlayers.length}
          />
          <View style={styles.selectionActions}>
            <Button
              label={t("draw.selectAll")}
              variant="ghost"
              size="sm"
              onPress={() => setSelectedIds(pickablePlayers.map((p) => p.id))}
            />
            <Button label={t("draw.clearSelection")} variant="ghost" size="sm" onPress={() => setSelectedIds([])} />
          </View>

          <Text style={styles.eligibleCount}>{t("draw.eligiblePlayers", { count: String(selectedIds.length) })}</Text>
        </Card>

        <Card style={styles.section}>
          <ScoreStepper label={t("draw.howMany")} value={howMany} onChange={setHowMany} max={Math.max(1, selectedIds.length)} />
          <Button
            label={suspense.isDrawing ? t("common.skip") : t("draw.drawButton")}
            onPress={suspense.isDrawing ? suspense.skip : draw}
            disabled={selectedIds.length === 0}
          />
        </Card>

        {drawnPlayers && drawnPlayers.length > 0 ? (
          <ResultRevealCard revealKey={revealKey}>
            <Text style={styles.resultTitle}>{t("draw.resultTitle")}</Text>
            {drawnPlayers.map((player) => (
              <View key={player.id} style={styles.resultRow}>
                <Avatar uri={player.avatar_url} name={player.display_name} color={player.custom_color} size={44} />
                <Text style={styles.resultName}>{player.display_name}</Text>
              </View>
            ))}
            <View style={styles.resultActions}>
              <Button label={t("common.redraw")} variant="secondary" size="sm" onPress={draw} />
            </View>
            <ShareCopyRow text={resultText} />
          </ResultRevealCard>
        ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingVertical: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  section: {
    gap: spacing.md,
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  toggleLabel: {
    ...typography.body,
  },
  label: {
    ...typography.small,
    color: colors.textSecondary,
  },
  selectionActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  eligibleCount: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  resultTitle: {
    ...typography.heading,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  resultName: {
    ...typography.bodyStrong,
  },
  resultActions: {
    flexDirection: "row",
  },
});
