import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Localization from "expo-localization";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Alert, DevSettings, I18nManager } from "react-native";
import en, { type TranslationKeys } from "./translations/en";
import he from "./translations/he";

export type Locale = "en" | "he";

const STORAGE_KEY = "fc-rival:locale";
const RTL_LOCALES: Locale[] = ["he"];

const TRANSLATIONS: Record<Locale, TranslationKeys> = { en, he };

function isRTLLocale(locale: Locale): boolean {
  return RTL_LOCALES.includes(locale);
}

function detectDeviceLocale(): Locale {
  const code = Localization.getLocales()[0]?.languageCode;
  return code === "he" ? "he" : "en";
}

/** Dot-path lookup ("settings.language") into the flat-per-namespace translation object, with `{param}` interpolation. */
function resolve(dict: TranslationKeys, key: string, params?: Record<string, string | number>): string {
  const parts = key.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let value: any = dict;
  for (const part of parts) value = value?.[part];
  if (typeof value !== "string") return key;
  if (!params) return value;
  return Object.entries(params).reduce((text, [name, replacement]) => text.replaceAll(`{${name}}`, String(replacement)), value);
}

interface LocaleContextValue {
  locale: Locale;
  /** Whether the CURRENT locale should read as RTL -- may briefly differ from I18nManager.isRTL until the promised restart happens. */
  isRTL: boolean;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (cancelled) return;
      const resolved: Locale = stored === "en" || stored === "he" ? stored : detectDeviceLocale();
      const isFirstRun = stored === null;
      setLocaleState(resolved);

      // First-ever launch: align the native RTL flag with the detected/default
      // locale before anything has rendered in the wrong direction, no restart
      // prompt needed since the user hasn't seen a mismatched layout yet.
      if (isFirstRun && isRTLLocale(resolved) !== I18nManager.isRTL) {
        I18nManager.allowRTL(true);
        I18nManager.forceRTL(isRTLLocale(resolved));
        AsyncStorage.setItem(STORAGE_KEY, resolved).catch(() => {});
        try {
          DevSettings.reload();
        } catch {
          // No reload API available (e.g. a release build without expo-updates) --
          // layout direction will simply follow whatever I18nManager already had
          // until the app is next restarted by the user.
        }
      }

      setIsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setLocale = useCallback(
    (next: Locale) => {
      if (next === locale) return;
      setLocaleState(next);
      AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});

      const nextIsRTL = isRTLLocale(next);
      if (nextIsRTL === I18nManager.isRTL) return;

      const dict = TRANSLATIONS[next];
      Alert.alert(dict.settings.languageRestartTitle, dict.settings.languageRestartMessage, [
        { text: dict.common.cancel, style: "cancel" },
        {
          text: dict.settings.languageRestartNow,
          onPress: () => {
            I18nManager.allowRTL(true);
            I18nManager.forceRTL(nextIsRTL);
            try {
              DevSettings.reload();
            } catch {
              Alert.alert(dict.common.done, dict.settings.languageRestartLater);
            }
          },
        },
      ]);
    },
    [locale],
  );

  const t = useCallback((key: string, params?: Record<string, string | number>) => resolve(TRANSLATIONS[locale], key, params), [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, isRTL: isRTLLocale(locale), setLocale, t }),
    [locale, setLocale, t],
  );

  if (!isReady) return null;

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useTranslation(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useTranslation must be used within a LocaleProvider");
  return ctx;
}
