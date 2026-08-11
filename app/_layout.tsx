import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { ErrorBoundary } from "../src/components/ErrorBoundary";
import { AuthProvider } from "../src/lib/context/AuthProvider";
import { GroupProvider } from "../src/lib/context/GroupProvider";
import { ToastProvider } from "../src/lib/context/ToastProvider";
import { LocaleProvider } from "../src/lib/i18n";
import { queryClient } from "../src/lib/queryClient";
import { useAuth } from "../src/hooks/useAuth";
import { useGroup } from "../src/hooks/useGroup";
import { colors } from "../src/theme";
import { ThemeProvider } from "../src/theme/ThemeContext";

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
  );
}

export default function RootLayout() {
  return (
    // react-native-screens' native-stack (every Stack/modal in this app)
    // uses react-native-gesture-handler internally for its own gesture
    // detection (see node_modules/react-native-screens/src/gesture-handler/
    // ScreenGestureDetector.tsx) -- gesture-handler requires this root
    // wrapper to function correctly, and without it, its gesture
    // recognizers can end up in an inconsistent state that only a
    // different gesture (e.g. a ScrollView pan) forces back into sync.
    // This was previously missing entirely.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <ThemeProvider>
          <LocaleProvider>
            <QueryClientProvider client={queryClient}>
              <AuthProvider>
                <GroupProvider>
                  <ToastProvider>
                    <StatusBar style="dark" />
                    <RootNavigator />
                  </ToastProvider>
                </GroupProvider>
              </AuthProvider>
            </QueryClientProvider>
          </LocaleProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
