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
import { type Locale, useTranslation } from "../../../src/lib/i18n";
import type { GroupRole } from "../../../src/lib/types/database";
import { colors, radius, spacing, typography } from "../../../src/theme";

const LANGUAGE_OPTIONS: { value: Locale; labelKey: "settings.languageEnglish" | "settings.languageHebrew" }[] = [
  { value: "en", labelKey: "settings.languageEnglish" },
  { value: "he", labelKey: "settings.languageHebrew" },
];

const ROLE_LABEL_KEYS: Record<GroupRole, "settings.roleOwner" | "settings.roleAdmin" | "settings.roleMember"> = {
  owner: "settings.roleOwner",
  admin: "settings.roleAdmin",
  member: "settings.roleMember",
};

export default function SettingsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { currentGroup, currentRole, groups, memberships, setCurrentGroupId } = useGroup();
  const { t, locale, setLocale } = useTranslation();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleLogout = () => {
    confirmAction(`${t("settings.logOut")}?`, undefined, t("settings.logOut"), async () => {
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
    Share.share({ message: t("settings.shareInviteMessage", { groupName: currentGroup.name, code: currentGroup.invite_code }) });
  };

  const roleLabel = currentRole ? t(ROLE_LABEL_KEYS[currentRole]) : null;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{t("settings.title")}</Text>

        <Card style={styles.card}>
          <Text style={styles.cardLabel}>{t("settings.signedInAs")}</Text>
          <Text style={styles.cardValue}>{user?.email}</Text>
        </Card>

        {currentGroup ? (
          <Card style={styles.card}>
            <Text style={styles.cardLabel}>{t("settings.currentGroup")}</Text>
            <Text style={styles.cardValue}>{currentGroup.name}</Text>
            {roleLabel ? <Badge label={roleLabel} tone="accent" style={styles.roleTag} /> : null}
            <Pressable
              onPress={handleShareInvite}
              style={styles.inviteRow}
              accessibilityRole="button"
              accessibilityLabel={t("settings.shareInviteA11y", { code: currentGroup.invite_code })}
            >
              <Text style={styles.inviteCode}>{currentGroup.invite_code}</Text>
              <Text style={styles.inviteShare}>{t("settings.shareInvite")}</Text>
            </Pressable>
          </Card>
        ) : null}

        {currentGroup ? (
          <Card style={styles.card}>
            <Text style={styles.cardLabel}>{t("settings.groupManagement")}</Text>
            <Button label={t("league.title")} variant="secondary" onPress={() => router.push("/league-management")} />
          </Card>
        ) : null}

        {groups.length > 1 ? (
          <Card style={styles.card}>
            <Text style={styles.cardLabel}>{t("settings.switchGroup")}</Text>
            {memberships.map((m) => (
              <Pressable
                key={m.group.id}
                onPress={() => setCurrentGroupId(m.group.id)}
                style={styles.groupOption}
                accessibilityRole="button"
                accessibilityLabel={m.group.name}
                accessibilityState={{ selected: m.group.id === currentGroup?.id }}
              >
                <Text style={[styles.groupOptionLabel, m.group.id === currentGroup?.id && styles.groupOptionActive]}>
                  {m.group.name}
                </Text>
                {m.group.id === currentGroup?.id ? <Text style={styles.checkmark}>✓</Text> : null}
              </Pressable>
            ))}
          </Card>
        ) : null}

        <Card style={styles.card}>
          <Text style={styles.cardLabel}>{t("settings.language")}</Text>
          <View style={styles.languageRow}>
            {LANGUAGE_OPTIONS.map((option) => (
              <Pressable
                key={option.value}
                onPress={() => setLocale(option.value)}
                style={[styles.languageOption, locale === option.value && styles.languageOptionActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: locale === option.value }}
              >
                <Text style={[styles.languageOptionLabel, locale === option.value && styles.languageOptionLabelActive]}>
                  {t(option.labelKey)}
                </Text>
              </Pressable>
            ))}
          </View>
        </Card>

        <View style={styles.actions}>
          <Button label={t("settings.createGroup")} variant="secondary" onPress={() => router.push("/group/create")} />
          <Button label={t("settings.joinGroup")} variant="secondary" onPress={() => router.push("/group/join")} />
          <Button label={t("settings.logOut")} variant="danger" onPress={handleLogout} loading={isSigningOut} />
        </View>

        <Card style={styles.dangerZoneCard}>
          <Text style={styles.dangerZoneTitle}>{t("deleteAccount.entryButtonLabel")}</Text>
          <Text style={styles.dangerZoneHint}>{t("settings.deleteAccountHint")}</Text>
          <Button label={t("deleteAccount.entryButtonLabel")} variant="danger" onPress={() => router.push("/delete-account")} />
        </Card>

        <View style={styles.about}>
          <Text style={styles.aboutAppName}>{t("settings.aboutAppName")}</Text>
          <Text style={styles.aboutTagline}>{t("settings.aboutTagline")}</Text>
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
  languageRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  languageOption: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  languageOptionActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSubtle,
  },
  languageOptionLabel: {
    ...typography.body,
  },
  languageOptionLabelActive: {
    color: colors.accent,
    fontWeight: "700",
  },
  actions: {
    gap: spacing.md,
    marginTop: spacing.md,
  },
  dangerZoneCard: {
    gap: spacing.sm,
    borderColor: colors.danger,
  },
  dangerZoneTitle: {
    ...typography.heading,
    color: colors.danger,
  },
  dangerZoneHint: {
    ...typography.small,
    color: colors.textSecondary,
  },
  about: {
    alignItems: "center",
    marginTop: spacing.md,
    gap: 2,
  },
  aboutAppName: {
    ...typography.small,
    color: colors.textSecondary,
  },
  aboutTagline: {
    ...typography.small,
    color: colors.textSecondary,
  },
});
