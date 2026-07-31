import { StyleSheet, Text } from "react-native";
import { useTranslation } from "../lib/i18n";
import { colors, typography } from "../theme";

interface WinRateBreakdownProps {
  wins: number;
  losses: number;
  draws: number;
}

/** "6W • 3L • 1D" -- shown under any win-rate percentage so a raw "68%" is never left unexplained (message: "users should immediately understand where the percentage comes from"). */
export function WinRateBreakdown({ wins, losses, draws }: WinRateBreakdownProps) {
  const { t } = useTranslation();
  return <Text style={styles.text}>{t("metrics.winRateBreakdown", { wins, losses, draws })}</Text>;
}

const styles = StyleSheet.create({
  text: {
    ...typography.small,
    color: colors.textSecondary,
  },
});
