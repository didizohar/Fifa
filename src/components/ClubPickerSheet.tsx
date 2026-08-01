import { Ionicons } from "@expo/vector-icons";
import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FlatList, ListRenderItemInfo, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import {
  CUSTOM_CLUBS_LEAGUE_LABEL,
  NATIONAL_TEAMS_LEAGUE_LABEL,
  getLeagueIcon,
  isDuplicateClubName,
  isNationalTeamClubVersion,
  normalizeClubName,
  searchAllClubVersions,
  sortClubVersionsFavoritesFirst,
} from "../lib/clubRepository";
import { createCustomClub } from "../lib/clubs";
import { useLastOpenedLeague } from "../hooks/useLastOpenedLeague";
import { useTranslation } from "../lib/i18n";
import { clubKeys } from "../lib/queryClient";
import type { ClubVersion } from "../lib/types/database";
import { colors, radius, spacing, typography } from "../theme";
import { Button } from "./Button";
import { ClubListRow } from "./ClubListRow";
import { ClubPicker } from "./ClubPicker";
import { EmptyState } from "./EmptyState";
import { FadeIn } from "./FadeIn";
import { SkeletonList } from "./Skeleton";
import { StarRating } from "./StarRating";
import { TextField } from "./TextField";

type PickerMode = "menu" | "league" | "allClubs" | "recentlyUsed" | "favorites" | "customClubs" | "addCustom";

interface ClubPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  clubVersions: ClubVersion[];
  favoriteClubIds: string[];
  recentClubIds: string[];
  onToggleFavorite: (clubId: string) => void;
  onSelect: (clubVersion: ClubVersion) => void;
  /** A club to visually disable (e.g. the other side's already-picked club in a 2-sided selector). */
  disabledClubId?: string | null;
  includeNationalTeams: boolean;
  onToggleIncludeNationalTeams: (next: boolean) => void;
  groupId: string;
  gameVersionId: string;
  /** Shows a skeleton list instead of any mode's content while the club catalog is still loading. */
  isLoading?: boolean;
}

/**
 * The single production club-selection experience for every match-setup
 * flow (new match, edit match, rematch, Winners Stay). Opens to a mode menu
 * (League / All Clubs / Recently Used / Favorites / Custom Clubs / National
 * Teams), each mode reusing the same underlying club-version list, favorite
 * toggle, and selection callback. "Add Custom Club" is reachable from every
 * mode without leaving match setup -- creating a club immediately selects
 * it and closes the sheet, leaving whatever the caller's own form state was
 * completely untouched.
 */
export function ClubPickerSheet({
  visible,
  onClose,
  clubVersions,
  favoriteClubIds,
  recentClubIds,
  onToggleFavorite,
  onSelect,
  disabledClubId = null,
  includeNationalTeams,
  onToggleIncludeNationalTeams,
  groupId,
  gameVersionId,
  isLoading = false,
}: ClubPickerSheetProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { lastLeague, setLastLeague } = useLastOpenedLeague(groupId);
  const [mode, setMode] = useState<PickerMode>("menu");
  const [allClubsQuery, setAllClubsQuery] = useState("");

  const visibleClubVersions = useMemo(
    () => (includeNationalTeams ? clubVersions : clubVersions.filter((cv) => !isNationalTeamClubVersion(cv))),
    [clubVersions, includeNationalTeams],
  );

  const hasNationalTeams = useMemo(() => clubVersions.some(isNationalTeamClubVersion), [clubVersions]);

  const recentClubVersions = useMemo(
    () => recentClubIds.map((id) => visibleClubVersions.find((cv) => cv.club_id === id)).filter((cv): cv is ClubVersion => !!cv),
    [visibleClubVersions, recentClubIds],
  );
  const favoriteClubVersions = useMemo(
    () => visibleClubVersions.filter((cv) => favoriteClubIds.includes(cv.club_id)),
    [visibleClubVersions, favoriteClubIds],
  );
  const customClubVersions = useMemo(() => visibleClubVersions.filter((cv) => cv.club.group_id !== null), [visibleClubVersions]);
  const allClubsResults = useMemo(
    () => sortClubVersionsFavoritesFirst(searchAllClubVersions(visibleClubVersions, allClubsQuery, { includeNationalTeams }), favoriteClubIds),
    [visibleClubVersions, allClubsQuery, includeNationalTeams, favoriteClubIds],
  );

  const closeAndReset = useCallback(() => {
    setMode("menu");
    setAllClubsQuery("");
    onClose();
  }, [onClose]);

  const handleSelect = useCallback(
    (clubVersion: ClubVersion) => {
      onSelect(clubVersion);
      closeAndReset();
    },
    [onSelect, closeAndReset],
  );

  const handleCreated = (clubVersion: ClubVersion) => {
    queryClient.invalidateQueries({ queryKey: clubKeys.versions(gameVersionId) });
    handleSelect(clubVersion);
  };

  // useCallback so ClubListRow's React.memo actually skips re-rendering
  // every row (up to the entire club catalog in "All Clubs" mode) on every
  // keystroke in the search box -- see ClubPicker.tsx's identical fix for
  // the full explanation.
  const renderClubRow = useCallback(
    ({ item }: ListRenderItemInfo<ClubVersion>) => (
      <ClubListRow
        clubVersion={item}
        isFavorite={favoriteClubIds.includes(item.club_id)}
        isDisabled={disabledClubId !== null && item.club_id === disabledClubId}
        onSelect={handleSelect}
        onToggleFavorite={onToggleFavorite}
      />
    ),
    [favoriteClubIds, disabledClubId, handleSelect, onToggleFavorite],
  );

  const renderMenu = () => (
    <FadeIn>
      <ScrollView contentContainerStyle={styles.menuContent} showsVerticalScrollIndicator={false}>
        <View style={styles.nationalTeamsToggleRow}>
          <Text style={styles.nationalTeamsToggleLabel}>{t("clubPicker.includeNationalTeams")}</Text>
          <Switch value={includeNationalTeams} onValueChange={onToggleIncludeNationalTeams} />
        </View>

        <ModeRow icon="albums-outline" label={t("clubPicker.modeLeague")} onPress={() => setMode("league")} />
        <ModeRow icon="grid-outline" label={t("clubPicker.modeAllClubs")} onPress={() => setMode("allClubs")} />
        <ModeRow icon="time-outline" label={t("clubPicker.recentlyUsed")} onPress={() => setMode("recentlyUsed")} count={recentClubVersions.length} />
        <ModeRow icon="star-outline" label={t("clubPicker.modeFavorites")} onPress={() => setMode("favorites")} count={favoriteClubVersions.length} />
        <ModeRow icon="construct-outline" label={t("clubPicker.modeCustomClubs")} onPress={() => setMode("customClubs")} count={customClubVersions.length} />
        {includeNationalTeams && hasNationalTeams ? (
          <ModeRow icon="flag-outline" label={t("clubPicker.modeNationalTeams")} onPress={() => setMode("league")} />
        ) : null}

        <Button label={t("clubPicker.addCustomClub")} variant="secondary" onPress={() => setMode("addCustom")} />
      </ScrollView>
    </FadeIn>
  );

  const renderList = (data: ClubVersion[], emptyIcon: string, emptyMessage: string) =>
    data.length === 0 ? (
      <EmptyState icon={emptyIcon} title={emptyMessage} />
    ) : (
      <FlatList data={data} keyExtractor={(cv) => cv.id} renderItem={renderClubRow} contentContainerStyle={styles.listContent} />
    );

  const renderBody = () => {
    if (isLoading) return <SkeletonList count={6} height={48} />;

    switch (mode) {
      case "menu":
        return renderMenu();
      case "league":
        return (
          <ClubPicker
            clubVersions={visibleClubVersions}
            favoriteClubIds={favoriteClubIds}
            recentClubIds={recentClubIds}
            onToggleFavorite={onToggleFavorite}
            onSelect={handleSelect}
            disabledClubId={disabledClubId}
            hideRecentlyUsed
            initialLeague={lastLeague}
            onLeagueChange={setLastLeague}
          />
        );
      case "allClubs":
        return (
          <View style={styles.allClubsContainer}>
            <TextInput
              value={allClubsQuery}
              onChangeText={setAllClubsQuery}
              placeholder={t("clubPicker.searchAllClubs")}
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
            />
            {renderList(allClubsResults, "🔍", t("clubPicker.noResults"))}
          </View>
        );
      case "recentlyUsed":
        return renderList(recentClubVersions, "🕒", t("clubPicker.noRecentClubs"));
      case "favorites":
        return renderList(favoriteClubVersions, "⭐", t("clubPicker.noFavoriteClubs"));
      case "customClubs":
        return (
          <View style={styles.allClubsContainer}>
            <Button label={t("clubPicker.addCustomClub")} variant="secondary" onPress={() => setMode("addCustom")} />
            {renderList(customClubVersions, "🏗️", t("clubPicker.noCustomClubs"))}
          </View>
        );
      case "addCustom":
        return (
          <AddCustomClubForm
            groupId={groupId}
            gameVersionId={gameVersionId}
            existingClubNames={clubVersions.map((cv) => cv.club.name)}
            existingClubVersions={clubVersions}
            onCreated={handleCreated}
            onSelectExisting={handleSelect}
          />
        );
      default:
        return null;
    }
  };

  const title =
    mode === "menu"
      ? t("clubPicker.title")
      : mode === "league"
        ? t("clubPicker.chooseLeague")
        : mode === "allClubs"
          ? t("clubPicker.modeAllClubs")
          : mode === "recentlyUsed"
            ? t("clubPicker.recentlyUsed")
            : mode === "favorites"
              ? t("clubPicker.modeFavorites")
              : mode === "customClubs"
                ? t("clubPicker.modeCustomClubs")
                : t("clubPicker.addCustomClub");

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={closeAndReset} presentationStyle="pageSheet">
      <View style={styles.sheet}>
        <View style={styles.header}>
          {mode !== "menu" ? (
            <Pressable onPress={() => setMode("menu")} accessibilityRole="button" accessibilityLabel={t("common.back")} hitSlop={8} style={styles.headerSideButton}>
              <Ionicons name="chevron-back" size={22} color={colors.accent} />
            </Pressable>
          ) : (
            <View style={styles.headerSideButton} />
          )}
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Pressable onPress={closeAndReset} accessibilityRole="button" accessibilityLabel={t("common.close")} hitSlop={8} style={styles.headerSideButton}>
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </Pressable>
        </View>
        <View style={styles.body}>{renderBody()}</View>
      </View>
    </Modal>
  );
}

function ModeRow({ icon, label, onPress, count }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; count?: number }) {
  return (
    <Pressable onPress={onPress} style={styles.modeRow} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon} size={20} color={colors.accent} />
      <Text style={styles.modeRowLabel}>{label}</Text>
      {typeof count === "number" ? <Text style={styles.modeRowCount}>{count}</Text> : null}
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

interface AddCustomClubFormProps {
  groupId: string;
  gameVersionId: string;
  existingClubNames: string[];
  existingClubVersions: ClubVersion[];
  onCreated: (clubVersion: ClubVersion) => void;
  onSelectExisting: (clubVersion: ClubVersion) => void;
}

/**
 * Name-only-required custom club creation, reachable mid-match-setup. On a
 * duplicate name it never silently blocks the user -- it offers the
 * already-existing club as a one-tap selection instead, so "Beitar
 * Jerusalem" created twice by two different players in the same session
 * just resolves to the same club.
 */
function AddCustomClubForm({ groupId, gameVersionId, existingClubNames, existingClubVersions, onCreated, onSelectExisting }: AddCustomClubFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [league, setLeague] = useState("");
  const [country, setCountry] = useState("");
  const [starRating, setStarRating] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateMatch, setDuplicateMatch] = useState<ClubVersion | null>(null);

  const handleSubmit = async () => {
    if (isSubmitting) return;
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError(t("clubPicker.nameRequired"));
      return;
    }

    if (isDuplicateClubName(trimmed, existingClubNames)) {
      const normalized = normalizeClubName(trimmed);
      const match = existingClubVersions.find((cv) => normalizeClubName(cv.club.name) === normalized) ?? null;
      setDuplicateMatch(match);
      setError(t("clubPicker.duplicateClubError"));
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setDuplicateMatch(null);
    try {
      const created = await createCustomClub({
        groupId,
        gameVersionId,
        name: trimmed,
        league: league.trim() || null,
        country: country.trim() || null,
        starRating: starRating ?? undefined,
      });
      onCreated(created);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t("clubPicker.createError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.addCustomContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.addCustomHint}>{t("clubPicker.addCustomHint")}</Text>
      <TextField
        label={t("customClubs.nameLabel")}
        placeholder={t("customClubs.namePlaceholder")}
        value={name}
        onChangeText={(next) => {
          setName(next);
          setError(null);
          setDuplicateMatch(null);
        }}
        error={error}
        autoFocus
      />

      {duplicateMatch ? (
        <Pressable
          onPress={() => onSelectExisting(duplicateMatch)}
          style={styles.duplicateBanner}
          accessibilityRole="button"
          accessibilityLabel={t("clubPicker.useDuplicateInstead", { name: duplicateMatch.club.name })}
        >
          <Text style={styles.duplicateBannerText}>{t("clubPicker.useDuplicateInstead", { name: duplicateMatch.club.name })}</Text>
        </Pressable>
      ) : null}

      <Pressable
        onPress={() => setShowMore((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={showMore ? t("clubPicker.hideMoreOptions") : t("clubPicker.showMoreOptions")}
        hitSlop={8}
      >
        <Text style={styles.moreOptionsToggle}>{showMore ? t("clubPicker.hideMoreOptions") : t("clubPicker.showMoreOptions")}</Text>
      </Pressable>

      {showMore ? (
        <View style={styles.moreOptions}>
          <TextField label={t("customClubs.leagueLabel")} value={league} onChangeText={setLeague} />
          <TextField label={t("customClubs.countryLabel")} value={country} onChangeText={setCountry} />
          <View style={styles.starRatingRow}>
            <Text style={styles.starRatingLabel}>{t("clubPicker.starRatingOptional")}</Text>
            <StarRating value={starRating ?? 3} onChange={setStarRating} size={22} />
          </View>
        </View>
      ) : null}

      <Button label={t("customClubs.addClub")} onPress={handleSubmit} loading={isSubmitting} disabled={isSubmitting || name.trim().length === 0} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerSideButton: {
    width: 32,
    alignItems: "center",
  },
  title: {
    ...typography.heading,
    flex: 1,
    textAlign: "center",
  },
  body: {
    flex: 1,
    padding: spacing.lg,
  },
  menuContent: {
    gap: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  nationalTeamsToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  nationalTeamsToggleLabel: {
    ...typography.body,
    flex: 1,
    marginEnd: spacing.md,
  },
  modeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  modeRowLabel: {
    ...typography.bodyStrong,
    flex: 1,
  },
  modeRowCount: {
    ...typography.small,
    color: colors.textSecondary,
  },
  allClubsContainer: {
    flex: 1,
    gap: spacing.sm,
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
  listContent: {
    paddingBottom: spacing.xl,
  },
  addCustomContent: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  addCustomHint: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  duplicateBanner: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentSubtle,
    padding: spacing.md,
  },
  duplicateBannerText: {
    ...typography.small,
    color: colors.accent,
    fontWeight: "700",
  },
  moreOptionsToggle: {
    ...typography.small,
    color: colors.accent,
    fontWeight: "700",
  },
  moreOptions: {
    gap: spacing.md,
  },
  starRatingRow: {
    gap: spacing.xs,
  },
  starRatingLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
