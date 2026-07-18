import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { Badge } from "../../../src/components/Badge";
import { Button } from "../../../src/components/Button";
import { Card } from "../../../src/components/Card";
import { Screen } from "../../../src/components/Screen";
import { useAuth } from "../../../src/hooks/useAuth";
import { useGroup } from "../../../src/hooks/useGroup";
import { signOut } from "../../../src/lib/auth";
import { confirmAction } from "../../../src/lib/confirm";
import { colors, radius, spacing, typography } from "../../../src/theme";

export default function SettingsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { currentGroup, currentRole, groups, memberships, setCurrentGroupId } = useGroup();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleLogout = () => {
    confirmAction("Log out?", undefined, "Log out", async () => {
      setIsSigningOut(true);
      try {
        await signOut();
      } finally {
        setIsSigningOut(false);
      }
    });
  };

  const handleShareInvite = () => {
    if (!currentGroup) return;
    Share.share({ message: `Join my FC Rival group "${currentGroup.name}" with invite code: ${currentGroup.invite_code}` });
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Settings</Text>

        <Card style={styles.card}>
          <Text style={styles.cardLabel}>Signed in as</Text>
          <Text style={styles.cardValue}>{user?.email}</Text>
        </Card>

        {currentGroup ? (
          <Card style={styles.card}>
            <Text style={styles.cardLabel}>Current group</Text>
            <Text style={styles.cardValue}>{currentGroup.name}</Text>
            {currentRole ? <Badge label={currentRole.charAt(0).toUpperCase() + currentRole.slice(1)} tone="accent" style={styles.roleTag} /> : null}
            <Pressable onPress={handleShareInvite} style={styles.inviteRow}>
              <Text style={styles.inviteCode}>{currentGroup.invite_code}</Text>
              <Text style={styles.inviteShare}>Share invite</Text>
            </Pressable>
          </Card>
        ) : null}

        {groups.length > 1 ? (
          <Card style={styles.card}>
            <Text style={styles.cardLabel}>Switch group</Text>
            {memberships.map((m) => (
              <Pressable
                key={m.group.id}
                onPress={() => setCurrentGroupId(m.group.id)}
                style={styles.groupOption}
              >
                <Text style={[styles.groupOptionLabel, m.group.id === currentGroup?.id && styles.groupOptionActive]}>
                  {m.group.name}
                </Text>
                {m.group.id === currentGroup?.id ? <Text style={styles.checkmark}>✓</Text> : null}
              </Pressable>
            ))}
          </Card>
        ) : null}

        <View style={styles.actions}>
          <Button label="Create another group" variant="secondary" onPress={() => router.push("/group/create")} />
          <Button label="Join another group" variant="secondary" onPress={() => router.push("/group/join")} />
          <Button label="Log out" variant="danger" onPress={handleLogout} loading={isSigningOut} />
        </View>
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
  card: {
    gap: spacing.xs,
  },
  cardLabel: {
    ...typography.small,
  },
  cardValue: {
    ...typography.bodyStrong,
  },
  roleTag: {
    alignSelf: "flex-start",
    marginTop: 2,
  },
  inviteRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.accentSubtle,
    borderRadius: radius.md,
  },
  inviteCode: {
    ...typography.bodyStrong,
    color: colors.accent,
    letterSpacing: 2,
  },
  inviteShare: {
    ...typography.small,
    color: colors.accent,
  },
  groupOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  groupOptionLabel: {
    ...typography.body,
  },
  groupOptionActive: {
    color: colors.accent,
    fontWeight: "700",
  },
  checkmark: {
    color: colors.accent,
    fontWeight: "700",
  },
  actions: {
    gap: spacing.md,
    marginTop: spacing.md,
  },
});
