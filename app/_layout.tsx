import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "../src/lib/context/AuthProvider";
import { GroupProvider } from "../src/lib/context/GroupProvider";
import { queryClient } from "../src/lib/queryClient";
import { useAuth } from "../src/hooks/useAuth";
import { useGroup } from "../src/hooks/useGroup";
import { colors } from "../src/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

function RootNavigator() {
  const { session, isLoading: isAuthLoading } = useAuth();
  const { groups, isLoading: isGroupsLoading } = useGroup();

  const isResolved = !isAuthLoading && (!session || !isGroupsLoading);

  useEffect(() => {
    if (isResolved) SplashScreen.hideAsync().catch(() => {});
  }, [isResolved]);

  if (!isResolved) return null;

  const hasGroup = groups.length > 0;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={!!session && !hasGroup}>
        <Stack.Screen name="(onboarding)" />
      </Stack.Protected>
      <Stack.Protected guard={!!session && hasGroup}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Screen name="group/create" options={{ presentation: "modal" }} />
      <Stack.Screen name="group/join" options={{ presentation: "modal" }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <GroupProvider>
          <StatusBar style="light" />
          <RootNavigator />
        </GroupProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
