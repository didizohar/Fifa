import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "../lib/i18n";
import type { ClubVersion } from "../lib/types/database";
import { colors, radius, spacing, typography } from "../theme";
import { StarRating } from "./StarRating";

interface ClubListRowProps {
  clubVersion: ClubVersion;
  isFavorite: boolean;
  isDisabled: boolean;
  onSelect: (clubVersion: ClubVersion) => void;
  onToggleFavorite: (clubId: string) => void;
}

/**
 * Shared row for ClubPicker's and ClubPickerSheet's club FlatLists.
 * Memoized because both lists can hold hundreds of clubs -- without this,
 * every row's Pressable/StarRating tree was fully re-created (renderItem
 * was an inline closure) on every keystroke in the search box, since
 * FlatList calls renderItem again for every visible row whenever `data`'s
 * reference changes. clubVersion/isFavorite/isDisabled/onSelect/
 * onToggleFavorite must all stay referentially stable for a row to skip
 * re-rendering -- see the callers for how each is stabilized.
 */
export const ClubListRow = memo(function ClubListRow({ clubVersion, isFavorite, isDisabled, onSelect, onToggleFavorite }: ClubListRowProps) {
  const { t } = useTranslation();
  return (
    <View style={[styles.clubRow, isDisabled && styles.clubRowDisabled]}>
      <Pressable
        onPress={() => !isDisabled && onSelect(clubVersion)}
        style={styles.clubRowMain}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityLabel={clubVersion.club.name}
      >
        <View style={[styles.logoPlaceholder, { backgroundColor: clubVersion.club.primary_color ?? colors.surfaceElevated }]}>
          <Text style={styles.logoInitial}>{clubVersion.club.name.trim().charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.clubInfo}>
          <Text style={styles.clubName} numberOfLines={1}>
            {clubVersion.club.name}
          </Text>
          <StarRating value={clubVersion.star_rating} size={12} />
        </View>
      </Pressable>
      <Pressable onPress={() => onToggleFavorite(clubVersion.club_id)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("clubPicker.toggleFavorite")}>
        <Text style={styles.favoriteIcon}>{isFavorite ? "★" : "☆"}</Text>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  clubRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  clubRowDisabled: {
    opacity: 0.4,
  },
  clubRowMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  logoPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  logoInitial: {
    ...typography.bodyStrong,
    color: colors.background,
  },
  clubInfo: {
    flex: 1,
    gap: 2,
  },
  clubName: {
    ...typography.body,
  },
  favoriteIcon: {
    fontSize: 20,
    color: colors.gold,
  },
});
