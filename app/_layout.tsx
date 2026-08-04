import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { ErrorBoundary } from "../src/components/ErrorBoundary";
import { AuthProvider } from "../src/lib/context/AuthProvider";
import { GroupProvider } from "../src/lib/context/GroupProvider";
import { LocaleProvider } from "../src/lib/i18n";
import { queryClient } from "../src/lib/queryClient";
import { RenderProfiler } from "../src/lib/renderProfiler";
import { useAuth } from "../src/hooks/useAuth";
import { useGroup } from "../src/hooks/useGroup";
import { colors } from "../src/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

function RootNavigator() {
  const { session, isLoading: isAuthLoading, isPasswordRecovery } = useAuth();
  const { groups, isLoading: isGroupsLoading } = useGroup();

  const isResolved = !isAuthLoading && (!session || !isGroupsLoading);

  useEffect(() => {
    if (isResolved) SplashScreen.hideAsync().catch(() => {});
  }, [isResolved]);

  if (!isResolved) return null;

  const hasGroup = groups.length > 0;

  return (
    <RenderProfiler id="RootNavigator">
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Protected guard={!session && !isPasswordRecovery}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        {/* Takes priority over the guards below: a password-recovery session is
            real (`session` is non-null), but the user must set a new password
            before landing in onboarding or the app. */}
        <Stack.Protected guard={isPasswordRecovery}>
          <Stack.Screen name="reset-password" options={{ presentation: "modal" }} />
        </Stack.Protected>
        <Stack.Protected guard={!!session && !hasGroup && !isPasswordRecovery}>
          <Stack.Screen name="(onboarding)" />
        </Stack.Protected>
        <Stack.Protected guard={!!session && hasGroup && !isPasswordRecovery}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Screen name="group/create" options={{ presentation: "modal" }} />
        <Stack.Screen name="group/join" options={{ presentation: "modal" }} />
      </Stack>
    </RenderProfiler>
  );
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <LocaleProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <GroupProvider>
              <StatusBar style="light" />
              <RootNavigator />
            </GroupProvider>
          </AuthProvider>
        </QueryClientProvider>
      </LocaleProvider>
    </ErrorBoundary>
  );
}
