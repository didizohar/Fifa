import TestRenderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { useFocusFrozenValue } from "../../src/hooks/useFocusFrozenValue";

let mockIsFocused = true;
jest.mock("expo-router", () => ({
  useIsFocused: () => mockIsFocused,
}));

function Harness({ value }: { value: string }) {
  const frozen = useFocusFrozenValue(value);
  return <Text testID="out">{frozen}</Text>;
}

function renderHarness(value: string) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Harness value={value} />);
  });
  return renderer;
}

function textOf(renderer: TestRenderer.ReactTestRenderer): string {
  return renderer.root.findByType(Text).props.children as string;
}

describe("useFocusFrozenValue", () => {
  beforeEach(() => {
    mockIsFocused = true;
  });

  it("tracks the live value while focused", () => {
    const renderer = renderHarness("v1");
    expect(textOf(renderer)).toBe("v1");
    act(() => renderer.update(<Harness value="v2" />));
    expect(textOf(renderer)).toBe("v2");
  });

  it("freezes at the last value the instant focus is lost, ignoring further updates", () => {
    const renderer = renderHarness("v1");
    mockIsFocused = false;
    act(() => renderer.update(<Harness value="v2" />));
    expect(textOf(renderer)).toBe("v1");
    act(() => renderer.update(<Harness value="v3" />));
    expect(textOf(renderer)).toBe("v1");
  });

  it("catches up to the current value the moment focus returns", () => {
    const renderer = renderHarness("v1");
    mockIsFocused = false;
    act(() => renderer.update(<Harness value="v2" />));
    expect(textOf(renderer)).toBe("v1");

    mockIsFocused = true;
    act(() => renderer.update(<Harness value="v3" />));
    expect(textOf(renderer)).toBe("v3");
  });

  it("returns a referentially stable value across re-renders while unfocused (so downstream useMemo skips recomputation)", () => {
    const refs: object[] = [];
    function ObjHarness({ value }: { value: object }) {
      const frozen = useFocusFrozenValue(value);
      refs.push(frozen);
      return null;
    }
    let renderer!: TestRenderer.ReactTestRenderer;
    const obj1 = { n: 1 };
    act(() => {
      renderer = TestRenderer.create(<ObjHarness value={obj1} />);
    });
    mockIsFocused = false;
    act(() => renderer.update(<ObjHarness value={{ n: 2 }} />));
    act(() => renderer.update(<ObjHarness value={{ n: 3 }} />));
    expect(refs[0]).toBe(obj1);
    expect(refs[1]).toBe(obj1);
    expect(refs[2]).toBe(obj1);
  });
});
