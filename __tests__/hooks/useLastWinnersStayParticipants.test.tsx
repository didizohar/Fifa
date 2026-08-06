import TestRenderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { useLastWinnersStayParticipants } from "../../src/hooks/useLastWinnersStayParticipants";

const mockGetItem = jest.fn();
const mockSetItem = jest.fn();
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: (...args: unknown[]) => mockGetItem(...args),
  setItem: (...args: unknown[]) => mockSetItem(...args),
}));

function Harness({ groupId, onReady }: { groupId: string | null; onReady: (api: ReturnType<typeof useLastWinnersStayParticipants>) => void }) {
  const api = useLastWinnersStayParticipants(groupId);
  onReady(api);
  return <Text>{api.participantIds.join(",")}</Text>;
}

async function renderHarness(groupId: string | null) {
  let latest!: ReturnType<typeof useLastWinnersStayParticipants>;
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<Harness groupId={groupId} onReady={(api) => (latest = api)} />);
    await Promise.resolve();
    await Promise.resolve();
  });
  return { renderer, get: () => latest };
}

beforeEach(() => {
  mockGetItem.mockReset();
  mockSetItem.mockReset();
  mockGetItem.mockResolvedValue(null);
  mockSetItem.mockResolvedValue(undefined);
});

describe("useLastWinnersStayParticipants", () => {
  it("hydrates to an empty list when nothing is stored", async () => {
    const { get } = await renderHarness("group-1");
    expect(get().participantIds).toEqual([]);
    expect(get().isHydrated).toBe(true);
  });

  it("hydrates from a previously stored id list", async () => {
    mockGetItem.mockResolvedValue(JSON.stringify(["p1", "p2", "p3", "p4"]));
    const { get } = await renderHarness("group-1");
    expect(get().participantIds).toEqual(["p1", "p2", "p3", "p4"]);
  });

  it("ignores corrupted storage and starts empty", async () => {
    mockGetItem.mockResolvedValue("not valid json{{{");
    const { get } = await renderHarness("group-1");
    expect(get().participantIds).toEqual([]);
    expect(get().isHydrated).toBe(true);
  });

  it("setParticipantIds updates state and persists to AsyncStorage", async () => {
    const { get } = await renderHarness("group-1");
    await act(async () => {
      get().setParticipantIds(["p1", "p2"]);
      await Promise.resolve();
    });
    expect(mockSetItem).toHaveBeenCalledWith("fc-rival:lastWinnersStayParticipants:group-1", JSON.stringify(["p1", "p2"]));
  });

  it("scopes storage per group id", async () => {
    await renderHarness("group-A");
    expect(mockGetItem).toHaveBeenCalledWith("fc-rival:lastWinnersStayParticipants:group-A");
    await renderHarness("group-B");
    expect(mockGetItem).toHaveBeenCalledWith("fc-rival:lastWinnersStayParticipants:group-B");
  });

  it("returns an empty list and skips storage entirely when groupId is null", async () => {
    const { get } = await renderHarness(null);
    expect(get().participantIds).toEqual([]);
    expect(get().isHydrated).toBe(true);
    expect(mockGetItem).not.toHaveBeenCalled();
  });
});
