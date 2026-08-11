import { useMemo } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "../lib/i18n";
import { useTheme } from "../theme/ThemeContext";
import { StarRating } from "./StarRating";

interface ClubBadgeProps {
  name: string | null;
  starRating: number | null;
  size?: "sm" | "md";
}

/** Club name + star rating, used everywhere a drawn/selected club is shown. Falls back cleanly when a club or its rating is missing. */
export function ClubBadge({ name, starRating, size = "md" }: ClubBadgeProps) {
  const { t } = useTranslation();
  const { colors, radius, spacing, typography } = useTheme();
  const isSm = size === "sm";
  const styles = useMemo(
    () => ({
      container: {
        gap: spacing.xs,
        paddingHorizontal: isSm ? spacing.sm : spacing.md,
        paddingVertical: isSm ? spacing.xs : spacing.sm,
        borderRadius: radius.md,
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.borderSubtle,
        alignItems: "center" as const,
      },
      name: isSm ? { ...typography.caption, fontWeight: "700" as const } : { ...typography.bodyStrong },
    }),
    [colors, radius, spacing, typography, isSm],
  );

  return (
    <View style={styles.container}>
      <Text style={styles.name} numberOfLines={1}>
        {name ?? t("common.unknownClub")}
      </Text>
      <StarRating value={starRating} size={isSm ? 12 : 14} />
    </View>
  );
}
