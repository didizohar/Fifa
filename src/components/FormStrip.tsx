import { useMemo } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "../lib/i18n";
import type { SideResult } from "../lib/types/database";
import { useTheme } from "../theme/ThemeContext";

interface FormStripProps {
  /** Most recent first. */
  results: SideResult[];
}

export function FormStrip({ results }: FormStripProps) {
  const { t } = useTranslation();
  const { colors, radius, spacing, typography } = useTheme();
  const color: Record<SideResult, string> = { win: colors.win, loss: colors.loss, draw: colors.draw };
  const label: Record<SideResult, string> = {
    win: t("common.resultWinAbbr"),
    loss: t("common.resultLossAbbr"),
    draw: t("common.resultDrawAbbr"),
  };
  const styles = useMemo(
    () => ({
      row: { flexDirection: "row" as const, gap: spacing.xs },
      chip: { width: 28, height: 28, borderRadius: radius.sm, borderWidth: 1, alignItems: "center" as const, justifyContent: "center" as const },
      label: { ...typography.small, fontWeight: "700" as const },
      empty: { ...typography.caption },
    }),
    [radius, spacing, typography],
  );

  if (results.length === 0) {
    return <Text style={styles.empty}>{t("common.noMatchesYet")}</Text>;
  }

  return (
    <View style={styles.row}>
      {results.map((result, index) => (
        <View key={index} style={[styles.chip, { backgroundColor: `${color[result]}26`, borderColor: color[result] }]}>
          <Text style={[styles.label, { color: color[result] }]}>{label[result]}</Text>
        </View>
      ))}
    </View>
  );
}
