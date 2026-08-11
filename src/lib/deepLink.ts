import Constants from "expo-constants";

/**
 * A stable `<scheme>://path` deep link for auth email redirects (password
 * reset, signup confirmation) -- deliberately NOT expo-linking's
 * Linking.createURL(), which embeds the local Metro dev server's address
 * (Constants.expoConfig.hostUri) into the URL whenever a development build
 * is connected live to `expo start --dev-client`. That address means
 * nothing to Supabase's mail server or to the app's allow-listed redirect
 * URL (`fcrival://**`), so Supabase silently falls back to the project's
 * Site URL instead of opening the app. Auth email links always need the
 * plain, environment-independent form this returns, in every build type.
 */
export function authDeepLink(path: string): string {
  return `${Constants.expoConfig?.scheme ?? "fcrival"}://${path}`;
}
