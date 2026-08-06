import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Button } from "../../src/components/Button";
import { InfoBanner } from "../../src/components/InfoBanner";
import { Screen } from "../../src/components/Screen";
import { TextField } from "../../src/components/TextField";
import { useDeleteAccount } from "../../src/hooks/useDeleteAccount";
import { deleteAccountConfirmationMatches } from "../../src/lib/auth";
import { useTranslation } from "../../src/lib/i18n";
import { colors, radius, spacing, typography } from "../../src/theme";

const DELETED_ITEM_KEYS = ["deleteAccount.itemLogin", "deleteAccount.itemAccess", "deleteAccount.itemProfile", "deleteAccount.itemSoloGroups"] as const;

export default function DeleteAccountScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const deleteAccountMutation = useDeleteAccount();
  // Synchronous double-tap guard, same pattern as record-match.tsx's
  // submitGuardRef -- isPending is only as fresh as the last completed
  // render, so two taps fired in the same event-loop tick (before React
  // re-renders) would both see the same stale `false` and both proceed.
  // This is a permanent, irreversible account deletion -- it must never
  // fire the RPC twice from a single confirm tap.
  const submitGuardRef = useRef(false);

  const confirmed = deleteAccountConfirmationMatches(confirmText);

  const handleDelete = async () => {
    if (!confirmed || deleteAccountMutation.isPending || submitGuardRef.current) return;
    setError(null);
    submitGuardRef.current = true;
    try {
      await deleteAccountMutation.mutateAsync();
      // No explicit navigation -- signOut("local") inside useDeleteAccount
      // already fires the SIGNED_OUT auth event, and RootNavigator's
      // existing !session guard takes it from there straight to (auth),
      // exactly like the regular Log Out button. Deliberately NOT resetting
      // the guard here: this screen is about to be replaced by the auth
      // stack, so there's nothing to re-enable.
    } catch (e) {
      submitGuardRef.current = false;
      setError(e instanceof Error && e.message ? e.message : t("deleteAccount.genericError"));
    }
  };

  return (
    <Screen avoidKeyboard>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{t("deleteAccount.screenTitle")}</Text>

        <InfoBanner tone="warning" message={t("deleteAccount.warningIntro")} />

        <View style={styles.itemList}>
          {DELETED_ITEM_KEYS.map((key) => (
            <View key={key} style={styles.itemRow}>
              <Text style={styles.itemBullet}>•</Text>
              <Text style={styles.itemText}>{t(key)}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.notReversible}>{t("deleteAccount.notReversible")}</Text>

        <TextField
          label={t("deleteAccount.confirmInputLabel")}
          placeholder={t("deleteAccount.confirmInputPlaceholder")}
          value={confirmText}
          onChangeText={(text) => {
            setConfirmText(text);
            setError(null);
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          error={error}
        />

        <Button
          label={t("deleteAccount.deleteButton")}
          variant="danger"
          onPress={handleDelete}
          loading={deleteAccountMutation.isPending}
          disabled={!confirmed || deleteAccountMutation.isPending}
        />
        <Button label={t("common.cancel")} variant="secondary" onPress={() => router.back()} disabled={deleteAccountMutation.isPending} />
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
