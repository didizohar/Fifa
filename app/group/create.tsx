import { useState } from "react";
import { Redirect, useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Button } from "../../src/components/Button";
import { Screen } from "../../src/components/Screen";
import { TextField } from "../../src/components/TextField";
import { useAuth } from "../../src/hooks/useAuth";
import { useGroup } from "../../src/hooks/useGroup";
import { createGroup } from "../../src/lib/groups";
import { useTranslation } from "../../src/lib/i18n";
import { spacing, typography } from "../../src/theme";

export default function CreateGroupScreen() {
  const { session } = useAuth();
  const { setCurrentGroupId, refetch } = useGroup();
  const router = useRouter();
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!session) return <Redirect href="/(auth)/login" />;

  const handleCreate = async () => {
    if (isSubmitting) return;
    if (name.trim().length < 2) {
      setError(t("group.nameTooShort"));
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const groupId = await createGroup(name.trim());
      await refetch();
      setCurrentGroupId(groupId);
      router.replace("/(app)/(tabs)");
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t("group.createError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen avoidKeyboard>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>{t("group.createTitle")}</Text>
          <Text style={styles.subtitle}>{t("group.createSubtitle")}</Text>
        </View>
        <View style={styles.form}>
          <TextField
            label={t("group.nameLabel")}
            placeholder={t("group.namePlaceholder")}
            value={name}
            onChangeText={setName}
            autoFocus
            returnKeyType="go"
            onSubmitEditing={handleCreate}
            error={error}
          />
          <Button label={t("group.createButton")} onPress={handleCreate} loading={isSubmitting} disabled={isSubmitting} />
        </View>
      </ScrollView>
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
