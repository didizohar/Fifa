import { useState } from "react";
import { Redirect, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "../../src/components/Button";
import { Screen } from "../../src/components/Screen";
import { TextField } from "../../src/components/TextField";
import { useAuth } from "../../src/hooks/useAuth";
import { useGroup } from "../../src/hooks/useGroup";
import { createGroup } from "../../src/lib/groups";
import { spacing, typography } from "../../src/theme";

export default function CreateGroupScreen() {
  const { session } = useAuth();
  const { setCurrentGroupId, refetch } = useGroup();
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!session) return <Redirect href="/(auth)/login" />;

  const handleCreate = async () => {
    if (name.trim().length < 2) {
      setError("Group name must be at least 2 characters.");
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
      setError(e instanceof Error ? e.message : "Failed to create group.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Create a group</Text>
        <Text style={styles.subtitle}>Give your group a name — you'll get an invite code to share afterward.</Text>
      </View>
      <View style={styles.form}>
        <TextField
          label="Group name"
          placeholder="e.g. Friday Night FC"
          value={name}
          onChangeText={setName}
          autoFocus
          error={error}
        />
        <Button label="Create group" onPress={handleCreate} loading={isSubmitting} />
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
