import { authDeepLink } from "../src/lib/deepLink";

describe("authDeepLink", () => {
  it("builds a plain <scheme>://path link, never expo-linking's Linking.createURL", () => {
    // Regression test: Linking.createURL() embeds the local Metro dev
    // server's address (Constants.expoConfig.hostUri) into the URL whenever
    // a development build is connected live to `expo start --dev-client`,
    // producing something like "fcrival:///192.168.1.5:8081reset-password"
    // instead of "fcrival://reset-password". Supabase's redirect URL
    // allow-list doesn't match that, so it silently falls back to the
    // project's Site URL instead of opening the app. authDeepLink must
    // never reproduce that -- it's a plain string template, not
    // environment-aware.
    expect(authDeepLink("reset-password")).toBe("fcrival://reset-password");
    expect(authDeepLink("auth/callback")).toBe("fcrival://auth/callback");
  });
});
