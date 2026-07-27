import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "../lib/i18n";
import { computeFormScore, countFormOutcomes } from "../lib/playerAnalyticsView";
import type { FormEntry } from "../lib/stats";
import { colors, spacing, typography } from "../theme";
import { FormStrip } from "./FormStrip";

interface RecentFormCardProps {
  /** Most recent first -- see stats.ts's computeLastNStats / analytics/playerAnalytics.ts's calculatePlayerRecentForm. */
  form: FormEntry[];
}

/** Recent-form summary: the W/D/L strip plus tallies and a compact form score -- never color-only, every result also carries its letter. */
export function RecentFormCard({ form }: RecentFormCardProps) {
  const { t } = useTranslation();

  if (form.length === 0) {
    return <Text style={styles.empty}>{t("playerAnalytics.recentFormEmpty")}</Text>;
  }

  const { wins, draws, losses } = countFormOutcomes(form);
  const score = computeFormScore(form);

  return (
    <View style={styles.container}>
      <FormStrip results={form.map((f) => f.result)} />
      <View style={styles.statsRow} accessibilityRole="text" accessibilityLabel={t("playerAnalytics.recentFormSummaryA11y", { wins, draws, losses, score })}>
        <FormStat label={t("playerAnalytics.wins")} value={wins} color={colors.win} />
        <FormStat label={t("playerAnalytics.draws")} value={draws} color={colors.draw} />
        <FormStat label={t("playerAnalytics.losses")} value={losses} color={colors.loss} />
        <FormStat label={t("playerAnalytics.formScore")} value={score} />
      </View>
    </View>
  );
}

function FormStat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  stat: {
    alignItems: "center",
    gap: 2,
  },
  statValue: {
    ...typography.heading,
  },
  statLabel: {
    ...typography.small,
  },
  empty: {
    ...typography.caption,
  },
});
