import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "../lib/i18n";
import type { SideResult } from "../lib/types/database";
import { colors, radius, spacing, typography } from "../theme";

const COLOR: Record<SideResult, string> = { win: colors.win, loss: colors.loss, draw: colors.draw };

interface FormStripProps {
  /** Most recent first. */
  results: SideResult[];
}

export function FormStrip({ results }: FormStripProps) {
  const { t } = useTranslation();
  const label: Record<SideResult, string> = {
    win: t("common.resultWinAbbr"),
    loss: t("common.resultLossAbbr"),
    draw: t("common.resultDrawAbbr"),
  };

  if (results.length === 0) {
    return <Text style={styles.empty}>{t("common.noMatchesYet")}</Text>;
  }

  return (
    <View style={styles.row}>
      {results.map((result, index) => (
        <View key={index} style={[styles.chip, { backgroundColor: `${COLOR[result]}26`, borderColor: COLOR[result] }]}>
          <Text style={[styles.label, { color: COLOR[result] }]}>{label[result]}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  chip: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    ...typography.small,
    fontWeight: "700",
  },
  empty: {
    ...typography.caption,
  },
});
