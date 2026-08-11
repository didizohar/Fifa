import TestRenderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { useThemePreference } from "../../src/hooks/useThemePreference";

const mockStore = new Map<string, string>();
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn((key: string) => Promise.resolve(mockStore.get(key) ?? null)),
  setItem: jest.fn((key: string, value: string) => {
    mockStore.set(key, value);
    return Promise.resolve();
  }),
}));

let lastApi: ReturnType<typeof useThemePreference> | null = null;
function Harness() {
  const api = useThemePreference();
  lastApi = api;
  return <Text>{api.preference}</Text>;
}

async function renderHarness() {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<Harness />);
    await Promise.resolve();
    await Promise.resolve();
  });
  return renderer;
}

beforeEach(() => {
  mockStore.clear();
  lastApi = null;
});

describe("useThemePreference", () => {
  it("defaults to 'system' when nothing was ever stored", async () => {
    await renderHarness();
    expect(lastApi!.preference).toBe("system");
    expect(lastApi!.isHydrated).toBe(true);
  });

  it("hydrates a previously stored preference on mount", async () => {
    mockStore.set("fc-rival:themePreference", "dark");
    await renderHarness();
    expect(lastApi!.preference).toBe("dark");
  });

  it("ignores a corrupted stored value and falls back to 'system'", async () => {
    mockStore.set("fc-rival:themePreference", "not-a-real-preference");
    await renderHarness();
    expect(lastApi!.preference).toBe("system");
  });

  it("setPreference updates state immediately and persists it", async () => {
    await renderHarness();
    await act(async () => {
      lastApi!.setPreference("light");
    });
    expect(lastApi!.preference).toBe("light");
    expect(mockStore.get("fc-rival:themePreference")).toBe("light");
  });
});
