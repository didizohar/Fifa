import { useState } from "react";
import { Redirect, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "../../src/components/Button";
import { Screen } from "../../src/components/Screen";
import { TextField } from "../../src/components/TextField";
import { useAuth } from "../../src/hooks/useAuth";
import { useGroup } from "../../src/hooks/useGroup";
import { joinGroupByInviteCode } from "../../src/lib/groups";
import { useTranslation } from "../../src/lib/i18n";
import { spacing, typography } from "../../src/theme";

export default function JoinGroupScreen() {
  const { session } = useAuth();
  const { setCurrentGroupId, refetch } = useGroup();
  const router = useRouter();
  const { t } = useTranslation();
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!session) return <Redirect href="/(auth)/login" />;

  const handleJoin = async () => {
    if (isSubmitting) return;
    if (inviteCode.trim().length < 4) {
      setError(t("group.inviteCodeTooShort"));
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const groupId = await joinGroupByInviteCode(inviteCode);
      await refetch();
      setCurrentGroupId(groupId);
      router.replace("/(app)/(tabs)");
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t("group.joinError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>{t("group.joinTitle")}</Text>
        <Text style={styles.subtitle}>{t("group.joinSubtitle")}</Text>
      </View>
      <View style={styles.form}>
        <TextField
          label={t("group.inviteCodeLabel")}
          placeholder={t("group.inviteCodePlaceholder")}
          value={inviteCode}
          onChangeText={(text) => setInviteCode(text.toUpperCase())}
          autoCapitalize="characters"
          autoFocus
          returnKeyType="go"
          onSubmitEditing={handleJoin}
          error={error}
        />
        <Button label={t("group.joinButton")} onPress={handleJoin} loading={isSubmitting} disabled={isSubmitting} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    marginTop: spacing.xl,
    marginBottom: spacing.xxl,
    gap: spacing.sm,
  },
  title: {
    ...typography.title,
  },
  subtitle: {
    ...typography.caption,
  },
  form: {
    gap: spacing.lg,
  },
});
