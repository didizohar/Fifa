import { Stack } from "expo-router";
import { useTranslation } from "../../src/lib/i18n";
import { colors } from "../../src/theme";

const themedHeaderOptions = {
  headerStyle: { backgroundColor: colors.background },
  headerTintColor: colors.textPrimary,
  headerShadowVisible: false,
};

export default function AppLayout() {
  const { t } = useTranslation();

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="record-match"
        options={{
          presentation: "modal",
          headerShown: true,
          title: "Record match",
          // A modal sheet's native interactive-dismiss pan gesture and the
          // content ScrollView's own pan gesture both want the same
          // vertical drag. Over the player-picker rows specifically, each
          // Pressable also claims itself as a responder candidate (JS-
          // resolved, unlike the two native recognizers), so a touch
          // starting there needs a three-way negotiation instead of two --
          // that's what stalled for seconds on a real device. Disabling
          // the gesture removes the competing recognizer at the source
          // instead of tuning fragile timing/delay props. The header back
          // button and Save/Cancel remain as the dismiss paths, which is
          // also the safer choice here: a system-level swipe-dismiss isn't
          // guaranteed to route through this screen's own unsaved-changes
          // guard (navigation.addListener("beforeRemove", ...)) the way a
          // button-driven dismiss does.
          gestureEnabled: false,
          ...themedHeaderOptions,
        }}
      />
      <Stack.Screen name="player/new" options={{ headerShown: true, title: "Add player", ...themedHeaderOptions }} />
      <Stack.Screen name="player/[id]/index" options={{ headerShown: true, title: "Player", ...themedHeaderOptions }} />
      <Stack.Screen name="player/[id]/edit" options={{ headerShown: true, title: "Edit player", ...themedHeaderOptions }} />
      <Stack.Screen name="match/[id]" options={{ headerShown: true, title: "Match", ...themedHeaderOptions }} />
      <Stack.Screen name="draw/index" options={{ headerShown: true, title: t("draw.title"), ...themedHeaderOptions }} />
      <Stack.Screen name="draw/players" options={{ headerShown: true, title: t("draw.randomPlayers"), ...themedHeaderOptions }} />
      <Stack.Screen name="draw/teams" options={{ headerShown: true, title: t("draw.createTeams"), ...themedHeaderOptions }} />
      <Stack.Screen name="draw/clubs" options={{ headerShown: true, title: t("draw.drawClubs"), ...themedHeaderOptions }} />
      <Stack.Screen name="draw/matchup" options={{ headerShown: true, title: t("draw.fullMatchup"), ...themedHeaderOptions }} />
      <Stack.Screen name="league-management" options={{ headerShown: true, title: t("league.title"), ...themedHeaderOptions }} />
      <Stack.Screen name="league-table" options={{ headerShown: true, title: t("leagueTable.title"), ...themedHeaderOptions }} />
      <Stack.Screen name="monthly-summary" options={{ headerShown: true, title: t("monthlySummary.title"), ...themedHeaderOptions }} />
      <Stack.Screen name="trends" options={{ headerShown: true, title: t("trendsScreen.title"), ...themedHeaderOptions }} />
      <Stack.Screen name="insights" options={{ headerShown: true, title: t("insightsScreen.title"), ...themedHeaderOptions }} />
      <Stack.Screen name="custom-clubs" options={{ headerShown: true, title: t("customClubs.title"), ...themedHeaderOptions }} />
      <Stack.Screen name="season-history" options={{ headerShown: true, title: t("seasonHistory.title"), ...themedHeaderOptions }} />
      <Stack.Screen name="season/[id]" options={{ headerShown: true, title: t("seasonHistory.detailsTitle"), ...themedHeaderOptions }} />
    </Stack>
  );
}
