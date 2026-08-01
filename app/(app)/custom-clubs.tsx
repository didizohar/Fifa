import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { Button } from "../../src/components/Button";
import { Card } from "../../src/components/Card";
import { EmptyState } from "../../src/components/EmptyState";
import { Screen } from "../../src/components/Screen";
import { SkeletonList } from "../../src/components/Skeleton";
import { StarRating } from "../../src/components/StarRating";
import { TextField } from "../../src/components/TextField";
import { useClubVersions } from "../../src/hooks/useClubVersions";
import { useGroup } from "../../src/hooks/useGroup";
import { clubKeys } from "../../src/lib/queryClient";
import { confirmAction } from "../../src/lib/confirm";
import { archiveCustomClub, createCustomClub } from "../../src/lib/clubs";
import { useTranslation } from "../../src/lib/i18n";
import { colors, radius, spacing, typography } from "../../src/theme";

export default function CustomClubsScreen() {
  const { t } = useTranslation();
  const { currentGroup } = useGroup();
  const queryClient = useQueryClient();
  const gameVersionId = currentGroup?.default_game_version_id ?? null;
  const { data: clubVersions, isLoading, refetch } = useClubVersions(gameVersionId);

  const [name, setName] = useState("");
  const [league, setLeague] = useState("");
  const [country, setCountry] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const customClubs = (clubVersions ?? []).filter((cv) => cv.club.group_id !== null);

  const invalidateClubs = () => {
    if (gameVersionId) queryClient.invalidateQueries({ queryKey: clubKeys.versions(gameVersionId) });
  };

  const handleCreate = async () => {
    if (isSubmitting || !currentGroup || !gameVersionId) return;
    setIsSubmitting(true);
    try {
      await createCustomClub({
        groupId: currentGroup.id,
        gameVersionId,
        name,
        league: league.trim() || null,
        country: country.trim() || null,
      });
      setName("");
      setLeague("");
      setCountry("");
      setError(null);
      invalidateClubs();
      refetch();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t("customClubs.createError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = (clubId: string) => {
    confirmAction(t("customClubs.removeConfirmTitle"), t("customClubs.removeConfirmMessage"), t("customClubs.remove"), async () => {
      try {
        await archiveCustomClub(clubId);
        invalidateClubs();
        refetch();
      } catch {
        setError(t("customClubs.removeError"));
      }
    });
  };

  return (
    <Screen padded={false} avoidKeyboard>
      <View style={styles.header}>
        <Text style={styles.title}>{t("customClubs.title")}</Text>
      </View>

      <View style={styles.formPadding}>
        <Card style={styles.formCard}>
          <TextField label={t("customClubs.nameLabel")} placeholder={t("customClubs.namePlaceholder")} value={name} onChangeText={setName} error={error} />
          <TextField label={t("customClubs.leagueLabel")} value={league} onChangeText={setLeague} />
          <TextField label={t("customClubs.countryLabel")} value={country} onChangeText={setCountry} />
          <Button label={t("customClubs.addClub")} onPress={handleCreate} loading={isSubmitting} disabled={isSubmitting || !name.trim()} />
        </Card>
      </View>

      {isLoading ? (
        <View style={styles.formPadding}>
          <SkeletonList count={4} height={56} />
        </View>
      ) : customClubs.length === 0 ? (
        <EmptyState icon="⭐" title={t("customClubs.emptyTitle")} message={t("customClubs.emptyMessage")} />
      ) : (
        <FlatList
          data={customClubs}
          keyExtractor={(cv) => cv.id}
          contentContainerStyle={styles.listPadding}
          renderItem={({ item }) => (
            <View style={styles.clubRow}>
              <View style={styles.clubInfo}>
                <Text style={styles.clubName} numberOfLines={1}>
                  {item.club.name}
                </Text>
                <StarRating value={item.star_rating} size={14} />
              </View>
              <Text style={styles.removeLink} onPress={() => handleRemove(item.club_id)}>
                {t("customClubs.remove")}
              </Text>
            </View>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  title: {
    ...typography.title,
  },
  formPadding: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  formCard: {
    gap: spacing.md,
  },
  listPadding: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  clubRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  clubInfo: {
    gap: spacing.xs,
    flex: 1,
  },
  clubName: {
    ...typography.bodyStrong,
  },
  removeLink: {
    ...typography.small,
    color: colors.danger,
    fontWeight: "700",
    paddingStart: spacing.md,
  },
});
