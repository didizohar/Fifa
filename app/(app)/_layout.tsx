import { Stack } from "expo-router";
import { HeaderBackButton } from "../../src/components/HeaderBackButton";
import { useTranslation } from "../../src/lib/i18n";
import { colors } from "../../src/theme";

const themedHeaderOptions = {
  headerStyle: { backgroundColor: colors.background },
  headerTintColor: colors.textPrimary,
  headerShadowVisible: false,
  // Modal screens (record-match, delete-group) keep this: they have their
  // own explicit Cancel/close affordances rather than a "back to X" label,
  // since dismissing a modal isn't "going back" to a previous screen in the
  // same sense a stack pop is.
  headerBackTitle: "",
};

// Every pushed (non-modal) screen: a custom header-left that shows "‹ Back
// to <previous screen>" instead of the native default (which falls back to
// blank/the raw route name whenever the screen beneath has no title of its
// own -- e.g. "(tabs)"). See HeaderBackButton.tsx for why this needs to be
// dynamic rather than a static per-screen string.
const pushedHeaderOptions = {
  ...themedHeaderOptions,
  headerBackTitle: undefined,
  headerLeft: () => <HeaderBackButton />,
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
          title: t("common.recordMatch"),
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
      <Stack.Screen name="player/new" options={{ headerShown: true, title: t("common.addPlayer"), ...pushedHeaderOptions }} />
      <Stack.Screen name="player/[id]/index" options={{ headerShown: true, title: t("common.playerTitle"), ...pushedHeaderOptions }} />
      <Stack.Screen name="player/[id]/edit" options={{ headerShown: true, title: t("common.editPlayer"), ...pushedHeaderOptions }} />
      <Stack.Screen name="match/[id]" options={{ headerShown: true, title: t("common.matchTitle"), ...pushedHeaderOptions }} />
      <Stack.Screen name="draw/index" options={{ headerShown: true, title: t("draw.title"), ...pushedHeaderOptions }} />
      <Stack.Screen name="draw/players" options={{ headerShown: true, title: t("draw.randomPlayers"), ...pushedHeaderOptions }} />
      <Stack.Screen name="draw/teams" options={{ headerShown: true, title: t("draw.createTeams"), ...pushedHeaderOptions }} />
      <Stack.Screen name="draw/clubs" options={{ headerShown: true, title: t("draw.drawClubs"), ...pushedHeaderOptions }} />
      <Stack.Screen name="draw/matchup" options={{ headerShown: true, title: t("draw.fullMatchup"), ...pushedHeaderOptions }} />
      <Stack.Screen name="league-management" options={{ headerShown: true, title: t("league.title"), ...pushedHeaderOptions }} />
      <Stack.Screen
        name="delete-group"
        options={{ headerShown: true, title: t("deleteGroup.screenTitle"), presentation: "modal", ...themedHeaderOptions }}
      />
      <Stack.Screen
        name="start-evening"
        options={{ headerShown: true, title: t("rotation.startEveningTitle"), presentation: "modal", ...themedHeaderOptions }}
      />
      <Stack.Screen name="league-table" options={{ headerShown: true, title: t("leagueTable.title"), ...pushedHeaderOptions }} />
      <Stack.Screen name="monthly-summary" options={{ headerShown: true, title: t("monthlySummary.title"), ...pushedHeaderOptions }} />
      <Stack.Screen name="trends" options={{ headerShown: true, title: t("trendsScreen.title"), ...pushedHeaderOptions }} />
      <Stack.Screen name="insights" options={{ headerShown: true, title: t("insightsScreen.title"), ...pushedHeaderOptions }} />
      <Stack.Screen name="custom-clubs" options={{ headerShown: true, title: t("customClubs.title"), ...pushedHeaderOptions }} />
      <Stack.Screen name="season-history" options={{ headerShown: true, title: t("seasonHistory.title"), ...pushedHeaderOptions }} />
      <Stack.Screen name="season/[id]" options={{ headerShown: true, title: t("seasonHistory.detailsTitle"), ...pushedHeaderOptions }} />
    </Stack>
  );
}
