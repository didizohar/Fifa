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
        options={{ presentation: "modal", headerShown: true, title: "Record match", ...themedHeaderOptions }}
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
    </Stack>
  );
}
