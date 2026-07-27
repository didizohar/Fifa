import { ScrollView, Text } from "react-native";
import { Screen } from "../../src/components/Screen";
import { useTranslation } from "../../src/lib/i18n";
import { spacing, typography } from "../../src/theme";

// Full feature set (manage/archive/delete/merge players, reset league, delete
// matches, backup export/import) lands in Stage 7 M6 -- this is the routable
// screen + entry point wired up now so Home's quick action has somewhere real
// to go, following the same incremental-hub pattern as the Draw screens.
export default function LeagueManagementScreen() {
  const { t } = useTranslation();
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingVertical: spacing.lg, gap: spacing.md }} showsVerticalScrollIndicator={false}>
        <Text style={typography.title}>{t("league.title")}</Text>
      </ScrollView>
    </Screen>
  );
}
