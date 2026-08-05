jest.mock("../src/lib/supabase", () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
    storage: {
      from: jest.fn(),
    },
  },
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  multiRemove: jest.fn().mockResolvedValue(undefined),
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../src/lib/supabase";
import { clearGroupAvatars, clearGroupLocalData, createGroup, deleteGroup, groupNameConfirmationMatches } from "../src/lib/groups";

const mockFrom = supabase.from as jest.Mock;
const mockRpc = supabase.rpc as jest.Mock;
const mockMultiRemove = AsyncStorage.multiRemove as jest.Mock;
const mockStorageFrom = supabase.storage.from as jest.Mock;

beforeEach(() => {
  mockFrom.mockReset();
  mockRpc.mockReset();
  // fetchDefaultGameVersion(): no default game version configured -- not
  // what this suite is testing, just needs to resolve so createGroup can
  // proceed to the RPC call.
  mockFrom.mockReturnValue({
    select: () => ({
      eq: () => ({
        limit: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
  });
});

describe("createGroup", () => {
  it("returns the group id on the first successful call", async () => {
    mockRpc.mockResolvedValueOnce({ data: "group-1", error: null });

    const id = await createGroup("Friday FC");

    expect(id).toBe("group-1");
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it("derives the group's timezone from the device instead of a hardcoded default", async () => {
    // Mocked rather than asserted against the real Intl output: on a machine
    // whose system timezone actually is Asia/Jerusalem, comparing against
    // that literal would pass even if the code still had it hardcoded.
    const resolvedOptionsSpy = jest
      .spyOn(Intl, "DateTimeFormat")
      .mockReturnValue({ resolvedOptions: () => ({ timeZone: "America/New_York" }) } as unknown as Intl.DateTimeFormat);
    mockRpc.mockResolvedValueOnce({ data: "group-1", error: null });

    await createGroup("Friday FC");

    const args = mockRpc.mock.calls[0]![1];
    expect(args.p_timezone).toBe("America/New_York");

    resolvedOptionsSpy.mockRestore();
  });

  it("retries with a fresh invite code after a unique-constraint collision", async () => {
    mockRpc
      .mockResolvedValueOnce({
        data: null,
        error: { code: "23505", message: 'duplicate key value violates unique constraint "groups_invite_code_key"' },
      })
      .mockResolvedValueOnce({ data: "group-2", error: null });

    const id = await createGroup("Friday FC");

    expect(id).toBe("group-2");
    expect(mockRpc).toHaveBeenCalledTimes(2);
    const firstCode = mockRpc.mock.calls[0]![1].p_invite_code;
    const secondCode = mockRpc.mock.calls[1]![1].p_invite_code;
    expect(secondCode).not.toBe(firstCode);
  });

  it("does not retry and surfaces non-collision errors immediately", async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "permission denied" } });

    await expect(createGroup("Friday FC")).rejects.toThrow(/permission denied/);
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it("gives up after exhausting retries on repeated invite-code collisions", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate" } });

    await expect(createGroup("Friday FC")).rejects.toThrow(/unique invite code/);
    expect(mockRpc).toHaveBeenCalledTimes(3);
  });
});

describe("groupNameConfirmationMatches", () => {
  it("matches an exact typed name", () => {
    expect(groupNameConfirmationMatches("Friday FC", "Friday FC")).toBe(true);
  });

  it("tolerates leading/trailing whitespace on the typed value", () => {
    expect(groupNameConfirmationMatches("Friday FC", "  Friday FC  ")).toBe(true);
  });

  it("rejects a case-mismatched name", () => {
    expect(groupNameConfirmationMatches("Friday FC", "friday fc")).toBe(false);
  });

  it("rejects a partial or unrelated name", () => {
    expect(groupNameConfirmationMatches("Friday FC", "Friday")).toBe(false);
  });

  it("rejects an empty or whitespace-only typed value", () => {
    expect(groupNameConfirmationMatches("Friday FC", "")).toBe(false);
    expect(groupNameConfirmationMatches("Friday FC", "   ")).toBe(false);
  });
});

describe("deleteGroup", () => {
  it("calls the delete_group RPC with the group id and confirmation name", async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    await deleteGroup("group-1", "Friday FC");

    expect(mockRpc).toHaveBeenCalledWith("delete_group", { p_group_id: "group-1", p_confirm_name: "Friday FC" });
  });

  it("throws when the RPC returns an error", async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: "Group name does not match" } });

    await expect(deleteGroup("group-1", "wrong name")).rejects.toThrow(/Group name does not match/);
  });
});

describe("clearGroupLocalData", () => {
  it("removes every group-scoped AsyncStorage key for the given group id", async () => {
    mockMultiRemove.mockResolvedValueOnce(undefined);

    await clearGroupLocalData("group-1");

    expect(mockMultiRemove).toHaveBeenCalledTimes(1);
    expect(mockMultiRemove).toHaveBeenCalledWith([
      "fc-rival:clubFavorites:group-1",
      "fc-rival:leagueTableCardExpanded:group-1",
      "fc-rival:lastOpenedLeague:group-1",
      "fc-rival:includeNationalTeams:group-1",
      "fc-rival:recentlyUsedClubs:group-1",
      "fc-rival:winnersStaySession:group-1",
      "fc-rival:winnersStaySessionHistory:group-1",
    ]);
  });
});

describe("clearGroupAvatars", () => {
  beforeEach(() => {
    mockStorageFrom.mockReset();
  });

  it("does nothing (and never calls remove) when the group has no avatar folders", async () => {
    const mockList = jest.fn().mockResolvedValue({ data: [], error: null });
    const mockRemove = jest.fn().mockResolvedValue({ data: [], error: null });
    mockStorageFrom.mockReturnValue({ list: mockList, remove: mockRemove });

    await clearGroupAvatars("group-1");

    expect(mockRemove).not.toHaveBeenCalled();
  });

  it("lists every player folder and removes every file found, through the Storage API", async () => {
    const mockList = jest
      .fn()
      .mockResolvedValueOnce({ data: [{ name: "player-a" }, { name: "player-b" }], error: null })
      .mockResolvedValueOnce({ data: [{ name: "111.jpg" }], error: null })
      .mockResolvedValueOnce({ data: [{ name: "222.jpg" }, { name: "333.jpg" }], error: null });
    const mockRemove = jest.fn().mockResolvedValue({ data: [], error: null });
    mockStorageFrom.mockReturnValue({ list: mockList, remove: mockRemove });

    await clearGroupAvatars("group-1");

    expect(mockList).toHaveBeenNthCalledWith(1, "group-1");
    expect(mockList).toHaveBeenNthCalledWith(2, "group-1/player-a");
    expect(mockList).toHaveBeenNthCalledWith(3, "group-1/player-b");
    expect(mockRemove).toHaveBeenCalledWith(["group-1/player-a/111.jpg", "group-1/player-b/222.jpg", "group-1/player-b/333.jpg"]);
  });

  it("throws if the Storage API remove call itself fails", async () => {
    const mockList = jest
      .fn()
      .mockResolvedValueOnce({ data: [{ name: "player-a" }], error: null })
      .mockResolvedValueOnce({ data: [{ name: "111.jpg" }], error: null });
    const mockRemove = jest.fn().mockResolvedValue({ data: null, error: { message: "network error" } });
    mockStorageFrom.mockReturnValue({ list: mockList, remove: mockRemove });

    await expect(clearGroupAvatars("group-1")).rejects.toThrow(/network error/);
  });
});
