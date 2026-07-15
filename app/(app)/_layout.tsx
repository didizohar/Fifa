import { Stack } from "expo-router";
import { colors } from "../../src/theme";

const themedHeaderOptions = {
  headerStyle: { backgroundColor: colors.background },
  headerTintColor: colors.textPrimary,
  headerShadowVisible: false,
};

export default function AppLayout() {
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
    </Stack>
  );
}
