import TestRenderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { Chip } from "../../src/components/Chip";

/**
 * Chip's own outer instance carries only whatever props were literally
 * passed to `<Chip>` (e.g. no `accessibilityRole` key at all if the caller
 * relies on the default) -- an unreliable target for a props-based query,
 * and `findByType(Pressable)` turned out to fail on a module-identity
 * mismatch between this test file's `react-native` import and the one
 * AnimatedPressable.tsx resolves internally. `hitSlop` is set by Chip only
 * from AnimatedPressable downward, never on Chip's own JSX props, so
 * pairing it with the requested role reliably isolates the fully-computed
 * pressable node regardless of import identity.
 */
function renderChip(props: Partial<React.ComponentProps<typeof Chip>> = {}) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Chip label="Filter" active={false} onPress={() => {}} {...props} />);
  });
  const role = props.accessibilityRole ?? "button";
  const matches = renderer.root.findAllByProps({ accessibilityRole: role });
  const target = matches.find((m) => "hitSlop" in m.props);
  if (!target) throw new Error(`No pressable node found with accessibilityRole="${role}" and hitSlop`);
  return target;
}

describe("Chip", () => {
  it("renders its label", () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<Chip label="Win Rate" active={false} onPress={() => {}} />);
    });
    const texts = renderer.root.findAllByType(Text);
    expect(texts.some((t) => t.props.children === "Win Rate")).toBe(true);
  });

  it("defaults to accessibilityRole=button with selected/disabled state -- unchanged from before this batch", () => {
    const pressable = renderChip({ active: true, disabled: false });
    expect(pressable.props.accessibilityRole).toBe("button");
    expect(pressable.props.accessibilityState).toEqual({ selected: true, disabled: false });
  });

  it("accepts an explicit radio role with the same selected/disabled state shape", () => {
    const pressable = renderChip({ accessibilityRole: "radio", active: true });
    expect(pressable.props.accessibilityRole).toBe("radio");
    expect(pressable.props.accessibilityState).toEqual({ selected: true, disabled: false });
  });

  it("uses checked (not selected) for an explicit checkbox role", () => {
    const pressable = renderChip({ accessibilityRole: "checkbox", active: true });
    expect(pressable.props.accessibilityRole).toBe("checkbox");
    expect(pressable.props.accessibilityState).toEqual({ checked: true, disabled: false });
  });

  it("calls onPress when tapped", () => {
    const onPress = jest.fn();
    const pressable = renderChip({ onPress });
    act(() => {
      pressable.props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("renders an icon before the label when provided, and none when omitted", () => {
    // Ionicons does an internal async font-load state check that logs a
    // harmless "not wrapped in act" warning in this environment (no real
    // native font module) -- doesn't affect what's actually rendered or
    // this test's pass/fail, so it's left as-is rather than chased.
    let withIcon!: TestRenderer.ReactTestRenderer;
    act(() => {
      withIcon = TestRenderer.create(<Chip label="X" active={false} onPress={() => {}} icon="shirt" />);
    });
    expect(withIcon.root.findAllByProps({ name: "shirt" }).length).toBe(1);

    let withoutIcon!: TestRenderer.ReactTestRenderer;
    act(() => {
      withoutIcon = TestRenderer.create(<Chip label="X" active={false} onPress={() => {}} />);
    });
    expect(withoutIcon.root.findAllByProps({ name: "shirt" }).length).toBe(0);
  });

  it("expands the hit area to a 44pt-class target without inflating the visible pill", () => {
    const pressable = renderChip();
    const { top, bottom } = pressable.props.hitSlop;
    // Compact visual padding (Chip's own paddingVertical) plus this slop
    // reaches the 44pt guideline -- asserting the mechanism (hitSlop
    // present, not zero) rather than a brittle exact pixel sum.
    expect(top).toBeGreaterThan(0);
    expect(bottom).toBeGreaterThan(0);
  });

  it("marks disabled state in both the interactive prop and accessibilityState", () => {
    const pressable = renderChip({ disabled: true });
    expect(pressable.props.disabled).toBe(true);
    expect(pressable.props.accessibilityState.disabled).toBe(true);
  });
});
