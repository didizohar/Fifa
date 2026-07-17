jest.mock("../src/lib/supabase", () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

import { supabase } from "../src/lib/supabase";
import { createGroup } from "../src/lib/groups";

const mockFrom = supabase.from as jest.Mock;
const mockRpc = supabase.rpc as jest.Mock;

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
