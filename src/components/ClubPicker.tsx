import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import {
  getLeagueIcon,
  groupClubVersionsByLeague,
  searchClubVersions,
  sortClubVersionsFavoritesFirst,
  type LeagueGroup,
} from "../lib/clubRepository";
import { useTranslation } from "../lib/i18n";
import type { ClubVersion } from "../lib/types/database";
import { colors, radius, spacing, typography } from "../theme";
import { Chevron } from "./Chevron";
import { StarRating } from "./StarRating";

interface ClubPickerProps {
  clubVersions: ClubVersion[];
  favoriteClubIds: string[];
  recentClubIds: string[];
  onToggleFavorite: (clubId: string) => void;
  onSelect: (clubVersion: ClubVersion) => void;
  /** A club to visually disable (e.g. the other side's already-picked club in a 2-sided selector). */
  disabledClubId?: string | null;
  /** Skip the league list and start already inside this league (e.g. "National Teams" mode). The user can still navigate back to the full league list. */
  initialLeague?: string | null;
  /** Hides the inline "Recently Used" section -- used when the host (ClubPickerSheet) already shows Recently Used as its own separate mode. */
  hideRecentlyUsed?: boolean;
  /** Fires with the league name whenever the user drills into one -- lets the host remember it as "last opened league" for next time. */
  onLeagueChange?: (league: string) => void;
}

/**
 * League-first club picker: recently-used clubs up top, then "choose a
 * league" (with a leagues list entirely derived from whatever data exists
 * -- adding a new league is a data change, never a UI change), then that
 * league's clubs, with search scoped to the selected league only and
 * favorites sorted first within it.
 */
export function ClubPicker({
  clubVersions,
  favoriteClubIds,
  recentClubIds,
  onToggleFavorite,
  onSelect,
  disabledClubId = null,
  initialLeague = null,
  hideRecentlyUsed = false,
  onLeagueChange,
}: ClubPickerProps) {
  const { t } = useTranslation();
  const [selectedLeague, setSelectedLeagueState] = useState<string | null>(initialLeague);
  const [query, setQuery] = useState("");

  const setSelectedLeague = (league: string | null) => {
    setSelectedLeagueState(league);
    if (league !== null) onLeagueChange?.(league);
  };

  const leagueGroups = useMemo(() => groupClubVersionsByLeague(clubVersions), [clubVersions]);
  const recentClubVersions = useMemo(
    () => recentClubIds.map((id) => clubVersions.find((cv) => cv.club_id === id)).filter((cv): cv is ClubVersion => !!cv),
    [clubVersions, recentClubIds],
  );

  if (selectedLeague === null) {
    return (
      <View style={styles.container}>
        {!hideRecentlyUsed && recentClubVersions.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("clubPicker.recentlyUsed")}</Text>
            <View style={styles.recentRow}>
              {recentClubVersions.map((cv) => (
                <Pressable key={cv.id} onPress={() => onSelect(cv)} style={styles.recentChip} accessibilityRole="button" accessibilityLabel={cv.club.name}>
                  <Text style={styles.recentChipText} numberOfLines={1}>
                    {cv.club.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>{t("clubPicker.chooseLeague")}</Text>
        {leagueGroups.map((group) => (
          <Pressable
            key={group.league}
            onPress={() => setSelectedLeague(group.league)}
            style={styles.leagueRow}
            accessibilityRole="button"
            accessibilityLabel={group.league}
          >
            <Text style={styles.leagueName}>
              {getLeagueIcon(group.league)} {group.league}
            </Text>
            <View style={styles.leagueRowEnd}>
              <Text style={styles.leagueCount}>{t("clubPicker.clubCount", { count: group.clubVersions.length })}</Text>
              <Chevron direction="forward" size={16} color={colors.textSecondary} />
            </View>
          </Pressable>
        ))}
      </View>
    );
  }

  const league: LeagueGroup = leagueGroups.find((g) => g.league === selectedLeague) ?? { league: selectedLeague, clubVersions: [] };
  const filtered = sortClubVersionsFavoritesFirst(searchClubVersions(league.clubVersions, query), favoriteClubIds);

  return (
    <View style={styles.container}>
      <Pressable onPress={() => { setSelectedLeague(null); setQuery(""); }} style={styles.backRow} accessibilityRole="button" accessibilityLabel={t("common.back")}>
        <Chevron direction="back" size={18} color={colors.accent} />
        <Text style={styles.backText}>{league.league}</Text>
      </Pressable>

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={t("clubPicker.searchInLeague")}
        placeholderTextColor={colors.textMuted}
        style={styles.searchInput}
      />

      <FlatList
        data={filtered}
        keyExtractor={(cv) => cv.id}
        renderItem={({ item }) => {
          const isFavorite = favoriteClubIds.includes(item.club_id);
          const isDisabled = disabledClubId !== null && item.club_id === disabledClubId;
          return (
            <View style={[styles.clubRow, isDisabled && styles.clubRowDisabled]}>
              <Pressable onPress={() => !isDisabled && onSelect(item)} style={styles.clubRowMain} disabled={isDisabled} accessibilityRole="button" accessibilityLabel={item.club.name}>
                <View style={[styles.logoPlaceholder, { backgroundColor: item.club.primary_color ?? colors.surfaceElevated }]}>
                  <Text style={styles.logoInitial}>{item.club.name.trim().charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.clubInfo}>
                  <Text style={styles.clubName} numberOfLines={1}>
                    {item.club.name}
                  </Text>
                  <StarRating value={item.star_rating} size={12} />
                </View>
              </Pressable>
              <Pressable onPress={() => onToggleFavorite(item.club_id)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("clubPicker.toggleFavorite")}>
                <Text style={styles.favoriteIcon}>{isFavorite ? "★" : "☆"}</Text>
              </Pressable>
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>{t("clubPicker.noResults")}</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  section: {
    gap: spacing.xs,
  },
  sectionTitle: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.textSecondary,
  },
  recentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  recentChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    maxWidth: 160,
  },
  recentChipText: {
    ...typography.caption,
  },
  leagueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  leagueName: {
    ...typography.bodyStrong,
  },
  leagueRowEnd: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  leagueCount: {
    ...typography.small,
    color: colors.textSecondary,
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingBottom: spacing.xs,
  },
  backText: {
    ...typography.bodyStrong,
    color: colors.accent,
  },
  searchInput: {
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
  },
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
  empty: {
    ...typography.caption,
    color: colors.textSecondary,
    paddingVertical: spacing.md,
    textAlign: "center",
  },
});
