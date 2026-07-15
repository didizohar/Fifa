import { useState } from "react";
import { Redirect, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "../../src/components/Button";
import { Screen } from "../../src/components/Screen";
import { TextField } from "../../src/components/TextField";
import { useAuth } from "../../src/hooks/useAuth";
import { useGroup } from "../../src/hooks/useGroup";
import { joinGroupByInviteCode } from "../../src/lib/groups";
import { spacing, typography } from "../../src/theme";

export default function JoinGroupScreen() {
  const { session } = useAuth();
  const { setCurrentGroupId, refetch } = useGroup();
  const router = useRouter();
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!session) return <Redirect href="/(auth)/login" />;

  const handleJoin = async () => {
    if (inviteCode.trim().length < 4) {
      setError("Enter the invite code your group owner shared with you.");
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
      setError(e instanceof Error ? e.message : "Failed to join group. Check the code and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Join a group</Text>
        <Text style={styles.subtitle}>Enter the invite code shared by your group's owner.</Text>
      </View>
      <View style={styles.form}>
        <TextField
          label="Invite code"
          placeholder="e.g. 7K3PXQ"
          value={inviteCode}
          onChangeText={(text) => setInviteCode(text.toUpperCase())}
          autoCapitalize="characters"
          autoFocus
          error={error}
        />
        <Button label="Join group" onPress={handleJoin} loading={isSubmitting} />
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
