import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Button } from "../../src/components/Button";
import { ErrorState } from "../../src/components/ErrorState";
import { InfoBanner } from "../../src/components/InfoBanner";
import { Screen } from "../../src/components/Screen";
import { TextField } from "../../src/components/TextField";
import { useAuth } from "../../src/hooks/useAuth";
import { useDeleteGroup } from "../../src/hooks/useDeleteGroup";
import { useGroup } from "../../src/hooks/useGroup";
import { useToast } from "../../src/lib/context/ToastProvider";
import { groupNameConfirmationMatches } from "../../src/lib/groups";
import { useTranslation } from "../../src/lib/i18n";
import { colors, radius, spacing, typography } from "../../src/theme";

const DELETED_ITEM_KEYS = [
  "deleteGroup.itemGroup",
  "deleteGroup.itemPlayers",
  "deleteGroup.itemMatches",
  "deleteGroup.itemSeasons",
  "deleteGroup.itemStandings",
  "deleteGroup.itemDrawHistory",
  "deleteGroup.itemPreferences",
] as const;

export default function DeleteGroupScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { currentGroup, currentRole } = useGroup();
  const { showToast } = useToast();
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const deleteGroupMutation = useDeleteGroup(user?.id);

  const canDelete = currentRole === "owner" || currentRole === "admin";

  if (!currentGroup) return null;

  // Defense in depth -- the entry point in League Management is already
  // gated to owner/admin, and the RPC itself re-checks authorization
  // server-side, but a direct deep link to this route should never show
  // the destructive form to someone who can't actually use it.
  if (!canDelete) {
    return (
      <Screen>
        <ErrorState message={t("deleteGroup.notAuthorized")} />
      </Screen>
    );
  }

  const nameMatches = groupNameConfirmationMatches(currentGroup.name, confirmText);

  const handleDelete = async () => {
    if (!nameMatches || deleteGroupMutation.isPending) return;
    setError(null);
    try {
      await deleteGroupMutation.mutateAsync({ groupId: currentGroup.id, confirmName: confirmText });
      showToast(t("deleteGroup.successMessage"));
      // No manual navigation -- GroupProvider's existing stale-currentGroupId
      // fallback and RootNavigator's existing "no groups -> onboarding"
      // guard handle this automatically once the groups list refetches,
      // the same way signOut() already works elsewhere in this app.
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t("deleteGroup.genericError"));
    }
  };

  return (
    <Screen avoidKeyboard>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{t("deleteGroup.warningTitle", { name: currentGroup.name })}</Text>

        <InfoBanner tone="warning" message={t("deleteGroup.warningIntro")} />

        <View style={styles.itemList}>
          {DELETED_ITEM_KEYS.map((key) => (
            <View key={key} style={styles.itemRow}>
              <Text style={styles.itemBullet}>•</Text>
              <Text style={styles.itemText}>{t(key)}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.notReversible}>{t("deleteGroup.notReversible")}</Text>

        <TextField
          label={t("deleteGroup.confirmInputLabel", { name: currentGroup.name })}
          placeholder={t("deleteGroup.confirmInputPlaceholder")}
          value={confirmText}
          onChangeText={(text) => {
            setConfirmText(text);
            setError(null);
          }}
          autoCapitalize="none"
          autoCorrect={false}
          error={error}
        />

        <Button
          label={t("deleteGroup.deleteButton")}
          variant="danger"
          onPress={handleDelete}
          loading={deleteGroupMutation.isPending}
          disabled={!nameMatches || deleteGroupMutation.isPending}
        />
        <Button label={t("deleteGroup.cancelButton")} variant="secondary" onPress={() => router.back()} disabled={deleteGroupMutation.isPending} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
    paddingVertical: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  title: {
    ...typography.title,
  },
  itemList: {
    gap: spacing.xs,
  },
  itemRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  itemBullet: {
    ...typography.body,
    color: colors.danger,
  },
  itemText: {
    ...typography.body,
    flex: 1,
  },
  notReversible: {
    ...typography.bodyStrong,
    color: colors.danger,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.dangerSubtle,
  },
});
