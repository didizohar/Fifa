import { useEffect, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "../../../../src/components/Button";
import { ErrorState } from "../../../../src/components/ErrorState";
import { Screen } from "../../../../src/components/Screen";
import { Skeleton } from "../../../../src/components/Skeleton";
import { StarRating } from "../../../../src/components/StarRating";
import { TextField } from "../../../../src/components/TextField";
import { useGroup } from "../../../../src/hooks/useGroup";
import { useUpdatePlayer } from "../../../../src/hooks/usePlayerMutations";
import { usePlayer } from "../../../../src/hooks/usePlayers";
import { useTranslation } from "../../../../src/lib/i18n";
import { colors, radius, spacing, typography } from "../../../../src/theme";

const COLOR_SWATCHES = ["#3EE07A", "#60A5FA", "#F5C451", "#F87171", "#C084FC", "#F97316", "#22D3EE"];

export default function EditPlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { currentGroupId } = useGroup();
  const { data: player, isLoading, isError, refetch } = usePlayer(id);
  const updatePlayer = useUpdatePlayer(currentGroupId);

  const [displayName, setDisplayName] = useState("");
  const [nickname, setNickname] = useState("");
  const [color, setColor] = useState(COLOR_SWATCHES[0]!);
  const [drawLevel, setDrawLevel] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Seed the form from server data exactly once, the first time it loads --
  // not on every subsequent refetch (e.g. React Query's default
  // refetch-on-window-focus, which is live on the web build), or an
  // in-progress edit gets silently overwritten with stale server values.
  const hasSeededForm = useRef(false);
  useEffect(() => {
    if (player && !hasSeededForm.current) {
      hasSeededForm.current = true;
      setDisplayName(player.display_name);
      setNickname(player.nickname ?? "");
      setColor(player.custom_color);
      setDrawLevel(player.draw_level);
    }
  }, [player]);

  if (isLoading || !player) {
    return (
      <Screen>
        {isError ? (
          <ErrorState message="Couldn't load this player's details. Check your connection and try again." onRetry={refetch} />
        ) : (
          <Skeleton height={200} />
        )}
      </Screen>
    );
  }

  const handleSubmit = async () => {
    if (displayName.trim().length < 2) {
      setError("Name must be at least 2 characters.");
      return;
    }
    setError(null);
    try {
      await updatePlayer.mutateAsync({
        playerId: player.id,
        patch: { display_name: displayName.trim(), nickname: nickname.trim() || null, custom_color: color, draw_level: drawLevel },
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update player.");
    }
  };

  return (
    <Screen>
      <View style={styles.form}>
        <TextField label="Name" value={displayName} onChangeText={setDisplayName} error={error} />
        <TextField label="Nickname (optional)" value={nickname} onChangeText={setNickname} />
        <View style={styles.colorSection}>
          <Text style={styles.colorLabel}>Color</Text>
          <View style={styles.swatchRow}>
            {COLOR_SWATCHES.map((swatch) => (
              <Pressable
                key={swatch}
                onPress={() => setColor(swatch)}
                style={[styles.swatch, { backgroundColor: swatch }, color === swatch && styles.swatchSelected]}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityLabel={`Color ${swatch}`}
                accessibilityState={{ selected: color === swatch }}
              />
            ))}
          </View>
        </View>
        <View style={styles.drawLevelSection}>
          <Text style={styles.colorLabel}>{t("draw.drawLevelLabel")}</Text>
          <Text style={styles.drawLevelHint}>{t("draw.drawLevelHint")}</Text>
          <View style={styles.drawLevelRow}>
            <StarRating value={drawLevel} onChange={setDrawLevel} size={28} />
            {drawLevel !== null ? (
              <Pressable onPress={() => setDrawLevel(null)} accessibilityRole="button" accessibilityLabel={t("draw.clearDrawLevel")}>
                <Text style={styles.drawLevelClear}>{t("common.clear")}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
        <Button label="Save changes" onPress={handleSubmit} loading={updatePlayer.isPending} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.lg,
    paddingTop: spacing.lg,
  },
  colorSection: {
    gap: spacing.sm,
  },
  colorLabel: {
    ...typography.caption,
  },
  swatchRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: "transparent",
  },
  swatchSelected: {
    borderColor: colors.textPrimary,
  },
  drawLevelSection: {
    gap: spacing.xs,
  },
  drawLevelHint: {
    fontSize: 12,
    color: colors.textMuted,
  },
  drawLevelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  drawLevelClear: {
    fontSize: 13,
    color: colors.accent,
    fontWeight: "600",
  },
});
