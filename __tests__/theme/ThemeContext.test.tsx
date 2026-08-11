import TestRenderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { resolveScheme, ThemeProvider, useTheme } from "../../src/theme/ThemeContext";
import { darkColors, lightColors } from "../../src/theme/colors";

const mockStore = new Map<string, string>();
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn((key: string) => Promise.resolve(mockStore.get(key) ?? null)),
  setItem: jest.fn((key: string, value: string) => {
    mockStore.set(key, value);
    return Promise.resolve();
  }),
}));

describe("resolveScheme -- pure branching logic (system vs. explicit override)", () => {
  it("follows the OS scheme when preference is 'system'", () => {
    expect(resolveScheme("system", "dark")).toBe("dark");
    expect(resolveScheme("system", "light")).toBe("light");
  });

  it("falls back to light when preference is 'system' and the OS reports no scheme", () => {
    expect(resolveScheme("system", null)).toBe("light");
    expect(resolveScheme("system", undefined)).toBe("light");
  });

  it("an explicit 'dark' preference wins regardless of the OS scheme", () => {
    expect(resolveScheme("dark", "light")).toBe("dark");
    expect(resolveScheme("dark", null)).toBe("dark");
  });

  it("an explicit 'light' preference wins regardless of the OS scheme", () => {
    expect(resolveScheme("light", "dark")).toBe("light");
    expect(resolveScheme("light", null)).toBe("light");
  });
});

let lastApi: ReturnType<typeof useTheme> | null = null;
function Harness() {
  const api = useTheme();
  lastApi = api;
  return <Text>{api.scheme}</Text>;
}

async function renderHarness() {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <ThemeProvider>
        <Harness />
      </ThemeProvider>,
    );
    await Promise.resolve();
    await Promise.resolve();
  });
  return renderer;
}

beforeEach(() => {
  mockStore.clear();
  lastApi = null;
});

describe("ThemeProvider / useTheme -- wiring (real react-native useColorScheme, not mocked -- see resolveScheme's own unit tests above for the OS-scheme branching itself)", () => {
  it("defaults to the 'system' preference and resolves colors/typography/shadows consistently for whatever scheme that is", async () => {
    await renderHarness();
    expect(lastApi!.preference).toBe("system");
    const expectedColors = lastApi!.scheme === "dark" ? darkColors : lightColors;
    expect(lastApi!.colors).toEqual(expectedColors);
    expect(lastApi!.typography.body.color).toBe(expectedColors.textPrimary);
  });

  it("an explicit 'dark' preference resolves to darkColors even if that isn't the current system scheme test default", async () => {
    mockStore.set("fc-rival:themePreference", "dark");
    await renderHarness();
    expect(lastApi!.scheme).toBe("dark");
    expect(lastApi!.colors).toEqual(darkColors);
    expect(lastApi!.typography.body.color).toBe(darkColors.textPrimary);
  });

  it("an explicit 'light' preference resolves to lightColors", async () => {
    mockStore.set("fc-rival:themePreference", "light");
    await renderHarness();
    expect(lastApi!.scheme).toBe("light");
    expect(lastApi!.colors).toEqual(lightColors);
  });

  it("setPreference updates the resolved scheme/colors/typography/shadows live and persists it", async () => {
    mockStore.set("fc-rival:themePreference", "light");
    await renderHarness();
    expect(lastApi!.scheme).toBe("light");

    await act(async () => {
      lastApi!.setPreference("dark");
    });

    expect(lastApi!.scheme).toBe("dark");
    expect(lastApi!.colors).toEqual(darkColors);
    expect(lastApi!.shadows.glow).not.toBeUndefined();
    expect(mockStore.get("fc-rival:themePreference")).toBe("dark");
  });
});
