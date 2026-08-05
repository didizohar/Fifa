import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "../lib/i18n";
import { colors, radius, spacing, typography } from "../theme";
import { StarRating } from "./StarRating";

interface ClubBadgeProps {
  name: string | null;
  starRating: number | null;
  size?: "sm" | "md";
}

/** Club name + star rating, used everywhere a drawn/selected club is shown. Falls back cleanly when a club or its rating is missing. */
export function ClubBadge({ name, starRating, size = "md" }: ClubBadgeProps) {
  const { t } = useTranslation();
  return (
    <View style={[styles.container, size === "sm" && styles.containerSm]}>
      <Text style={[styles.name, size === "sm" && styles.nameSm]} numberOfLines={1}>
        {name ?? t("common.unknownClub")}
      </Text>
      <StarRating value={starRating} size={size === "sm" ? 12 : 14} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: "center",
  },
  containerSm: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  name: {
    ...typography.bodyStrong,
  },
  nameSm: {
    ...typography.caption,
    fontWeight: "700",
  },
});
