import en from "../src/lib/i18n/translations/en";
import he from "../src/lib/i18n/translations/he";

function collectKeyPaths(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([key, value]) => collectKeyPaths(value, prefix ? `${prefix}.${key}` : key));
}

describe("translation key completeness", () => {
  it("has an identical key set in every locale, so a screen never falls back to a missing string", () => {
    const enKeys = collectKeyPaths(en).sort();
    const heKeys = collectKeyPaths(he).sort();
    expect(heKeys).toEqual(enKeys);
  });

  it("never leaves a key with an empty string value", () => {
    for (const [locale, dict] of [["en", en] as const, ["he", he] as const]) {
      for (const path of collectKeyPaths(dict)) {
        const value = path.split(".").reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], dict);
        expect(typeof value === "string" && value.trim().length > 0).toBe(true);
        if (!(typeof value === "string" && value.trim().length > 0)) {
          throw new Error(`${locale}.${path} is empty`);
        }
      }
    }
  });

  it("keeps the same {placeholder} names between locales for keys that use interpolation", () => {
    const placeholderNames = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

    for (const path of collectKeyPaths(en)) {
      const enValue = path.split(".").reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], en) as string;
      const heValue = path.split(".").reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], he) as string;
      expect(placeholderNames(heValue)).toEqual(placeholderNames(enValue));
    }
  });
});
