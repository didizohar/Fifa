import TestRenderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { AnimatedPressable } from "../../src/components/AnimatedPressable";
import { TextField } from "../../src/components/TextField";

// delete-account.tsx imports deleteAccountConfirmationMatches from
// src/lib/auth.ts, which imports src/lib/supabase.ts at module load time --
// same mocking need as every other screen test that touches auth/groups.
jest.mock("../../src/lib/supabase", () => ({
  supabase: { auth: { signOut: jest.fn() }, rpc: jest.fn(), from: jest.fn(), storage: { from: jest.fn() } },
}));
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
  clear: jest.fn().mockResolvedValue(undefined),
}));

const mockRouter = { back: jest.fn() };
jest.mock("expo-router", () => ({ useRouter: () => mockRouter }));

jest.mock("../../src/lib/i18n", () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: "en", isRTL: false, setLocale: jest.fn() }),
}));

let mockMutateAsyncImpl: () => Promise<void> = async () => {};
let mockIsPending = false;
const mockMutateAsync = jest.fn(() => mockMutateAsyncImpl());
jest.mock("../../src/hooks/useDeleteAccount", () => ({
  useDeleteAccount: () => ({ mutateAsync: mockMutateAsync, isPending: mockIsPending }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const DeleteAccountScreen = require("../../app/(app)/delete-account").default;

function renderScreen() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<DeleteAccountScreen />);
  });
  return renderer;
}

function findButton(renderer: TestRenderer.ReactTestRenderer, label: string) {
  const matches = renderer.root.findAllByType(AnimatedPressable).filter((n) => n.props.accessibilityLabel === label);
  if (matches.length === 0) throw new Error(`No button found with label "${label}"`);
  return matches[0]!;
}

function typeConfirmation(renderer: TestRenderer.ReactTestRenderer, text: string) {
  act(() => {
    renderer.root.findByType(TextField).props.onChangeText(text);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsPending = false;
  mockMutateAsyncImpl = async () => {};
});

describe("Delete Account -- confirmation gate", () => {
  it("the delete button is disabled until exactly \"DELETE\" is typed", () => {
    const renderer = renderScreen();
    expect(findButton(renderer, "deleteAccount.deleteButton").props.disabled).toBe(true);

    typeConfirmation(renderer, "delete");
    expect(findButton(renderer, "deleteAccount.deleteButton").props.disabled).toBe(true);

    typeConfirmation(renderer, "DELETE");
    expect(findButton(renderer, "deleteAccount.deleteButton").props.disabled).toBe(false);
  });

  it("does not call the mutation while the confirmation text is wrong", async () => {
    const renderer = renderScreen();
    typeConfirmation(renderer, "delete me");
    await act(async () => {
      findButton(renderer, "deleteAccount.deleteButton").props.onPress();
      await Promise.resolve();
    });
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });
});

describe("Delete Account -- deletion flow", () => {
  it("calls the account-deletion mutation exactly once when confirmed", async () => {
    const renderer = renderScreen();
    typeConfirmation(renderer, "DELETE");
    await act(async () => {
      findButton(renderer, "deleteAccount.deleteButton").props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
  });

  it("shows the server's exact error message when blocked by group ownership", async () => {
    mockMutateAsyncImpl = () => Promise.reject(new Error("Transfer ownership or delete these groups before deleting your account: Friday FC"));
    const renderer = renderScreen();
    typeConfirmation(renderer, "DELETE");
    await act(async () => {
      findButton(renderer, "deleteAccount.deleteButton").props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
    expect(texts.join(" ")).toContain("Transfer ownership or delete these groups before deleting your account: Friday FC");
  });

  it("falls back to a generic error message when the failure has no message", async () => {
    mockMutateAsyncImpl = () => Promise.reject(new Error(""));
    const renderer = renderScreen();
    typeConfirmation(renderer, "DELETE");
    await act(async () => {
      findButton(renderer, "deleteAccount.deleteButton").props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
    expect(texts).toContain("deleteAccount.genericError");
  });

  it("repeated taps while pending do not call the mutation more than once", async () => {
    let resolveFn!: () => void;
    mockMutateAsyncImpl = () => new Promise((resolve) => (resolveFn = resolve));
    const renderer = renderScreen();
    typeConfirmation(renderer, "DELETE");

    await act(async () => {
      const btn = findButton(renderer, "deleteAccount.deleteButton");
      btn.props.onPress();
      btn.props.onPress();
      btn.props.onPress();
      await Promise.resolve();
    });
    expect(mockMutateAsync).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFn();
      await Promise.resolve();
    });
  });

  it("the delete button reflects the mutation's pending state (disabled + loading)", () => {
    mockIsPending = true;
    const renderer = renderScreen();
    typeConfirmation(renderer, "DELETE");
    const btn = findButton(renderer, "deleteAccount.deleteButton");
    expect(btn.props.disabled).toBe(true);
  });
});

describe("Delete Account -- cancel", () => {
  it("Cancel navigates back without calling the mutation", () => {
    const renderer = renderScreen();
    act(() => {
      findButton(renderer, "common.cancel").props.onPress();
    });
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });
});
