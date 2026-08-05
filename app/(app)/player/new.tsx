import { useState } from "react";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button } from "../../../src/components/Button";
import { Screen } from "../../../src/components/Screen";
import { TextField } from "../../../src/components/TextField";
import { useGroup } from "../../../src/hooks/useGroup";
import { useCreatePlayer } from "../../../src/hooks/usePlayerMutations";
import { useTranslation } from "../../../src/lib/i18n";
import { colors, radius, spacing, typography } from "../../../src/theme";

const COLOR_SWATCHES = ["#3EE07A", "#60A5FA", "#F5C451", "#F87171", "#C084FC", "#F97316", "#22D3EE"];

export default function NewPlayerScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { currentGroupId } = useGroup();
  const createPlayer = useCreatePlayer(currentGroupId);

  const [displayName, setDisplayName] = useState("");
  const [nickname, setNickname] = useState("");
  const [color, setColor] = useState(COLOR_SWATCHES[0]!);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!currentGroupId) return;
    if (displayName.trim().length < 2) {
      setError(t("players.nameTooShortError"));
      return;
    }
    setError(null);
    try {
      await createPlayer.mutateAsync({
        groupId: currentGroupId,
        displayName: displayName.trim(),
        nickname: nickname.trim() || null,
        customColor: color,
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("players.addPlayerError"));
    }
  };

  return (
    <Screen avoidKeyboard>
      <ScrollView contentContainerStyle={styles.form} showsVerticalScrollIndicator={false}>
        <TextField label={t("players.nameLabel")} placeholder={t("players.namePlaceholder")} value={displayName} onChangeText={setDisplayName} autoFocus error={error} />
        <TextField label={t("players.nicknameLabel")} placeholder={t("players.nicknamePlaceholder")} value={nickname} onChangeText={setNickname} />
        <View style={styles.colorSection}>
          <Text style={styles.colorLabel}>{t("players.colorLabel")}</Text>
          <View style={styles.swatchRow}>
            {COLOR_SWATCHES.map((swatch) => (
              <Pressable
                key={swatch}
                onPress={() => setColor(swatch)}
                style={[styles.swatch, { backgroundColor: swatch }, color === swatch && styles.swatchSelected]}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityLabel={t("players.colorSwatchA11y", { swatch })}
                accessibilityState={{ selected: color === swatch }}
              />
            ))}
          </View>
        </View>
        <Button label={t("common.addPlayer")} onPress={handleSubmit} loading={createPlayer.isPending} />
      </ScrollView>
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
});
