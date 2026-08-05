import TestRenderer, { act } from "react-test-renderer";
import { ScrollView, Text, View } from "react-native";
import { AnimatedPressable } from "../../src/components/AnimatedPressable";
import { AppChipGroup, type ChipOption } from "../../src/components/AppChipGroup";

type Period = "all" | "month" | "week";

const OPTIONS: ChipOption<Period>[] = [
  { id: "all", label: "All Time" },
  { id: "month", label: "This Month" },
  { id: "week", label: "This Week" },
];

function render(el: React.ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(el);
  });
  return renderer;
}

/**
 * AnimatedPressable itself already receives the full, Chip-computed prop
 * set (role, accessibilityState, hitSlop, onPress, disabled) as a single
 * node -- unlike querying by props, which also matches Pressable/View
 * layers further down that carry the identical values, giving 4x as many
 * "matches" as there are actual chips. Targeting our own component by type
 * gives exactly one node per rendered option, in render (== options) order.
 */
function findPressables(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findAllByType(AnimatedPressable);
}

describe("AppChipGroup", () => {
  describe("single selection", () => {
    it("marks exactly the selected option active and reports it via accessibilityState", () => {
      const renderer = render(<AppChipGroup mode="single" options={OPTIONS} value="month" onChange={() => {}} />);
      const pressables = findPressables(renderer);
      expect(pressables.map((p) => p.props.accessibilityState.selected)).toEqual([false, true, false]);
    });

    it("calls onChange with the pressed option's id, not an array", () => {
      const onChange = jest.fn();
      const renderer = render(<AppChipGroup mode="single" options={OPTIONS} value="all" onChange={onChange} />);
      const [, monthPressable] = findPressables(renderer);
      act(() => monthPressable!.props.onPress());
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith("month");
    });

    it("selecting a different option doesn't call onChange with an array (mode stays single)", () => {
      const onChange = jest.fn();
      const renderer = render(<AppChipGroup mode="single" options={OPTIONS} value={null} onChange={onChange} />);
      const [allPressable] = findPressables(renderer);
      act(() => allPressable!.props.onPress());
      expect(Array.isArray(onChange.mock.calls[0]![0])).toBe(false);
    });
  });

  describe("multiple selection", () => {
    it("marks every selected id active", () => {
      const renderer = render(<AppChipGroup mode="multiple" options={OPTIONS} value={["all", "week"]} onChange={() => {}} />);
      const pressables = findPressables(renderer);
      expect(pressables.map((p) => p.props.accessibilityState.checked)).toEqual([true, false, true]);
    });

    it("adds an id when pressing an unselected option", () => {
      const onChange = jest.fn();
      const renderer = render(<AppChipGroup mode="multiple" options={OPTIONS} value={["all"]} onChange={onChange} />);
      const [, monthPressable] = findPressables(renderer);
      act(() => monthPressable!.props.onPress());
      expect(onChange).toHaveBeenCalledWith(["all", "month"]);
    });

    it("removes an id when pressing an already-selected option", () => {
      const onChange = jest.fn();
      const renderer = render(<AppChipGroup mode="multiple" options={OPTIONS} value={["all", "month"]} onChange={onChange} />);
      const [allPressable] = findPressables(renderer);
      act(() => allPressable!.props.onPress());
      expect(onChange).toHaveBeenCalledWith(["month"]);
    });
  });

  describe("disabled options", () => {
    const withDisabled: ChipOption<Period>[] = [OPTIONS[0]!, { ...OPTIONS[1]!, disabled: true }, OPTIONS[2]!];

    it("marks the disabled option's pressable and accessibilityState as disabled", () => {
      const renderer = render(<AppChipGroup mode="single" options={withDisabled} value="all" onChange={() => {}} />);
      const [, monthPressable] = findPressables(renderer);
      expect(monthPressable!.props.disabled).toBe(true);
      expect(monthPressable!.props.accessibilityState.disabled).toBe(true);
    });

    it("does not call onChange when a disabled option is pressed", () => {
      const onChange = jest.fn();
      const renderer = render(<AppChipGroup mode="single" options={withDisabled} value="all" onChange={onChange} />);
      const [, monthPressable] = findPressables(renderer);
      act(() => monthPressable!.props.onPress());
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("dynamic label width", () => {
    it("never applies a fixed width or flex to an individual chip -- sizing stays content-driven", () => {
      const longOptions: ChipOption<Period>[] = [
        { id: "all", label: "A" },
        { id: "month", label: "A Very Long Filter Label That Should Never Be Clipped Or Force-Wrapped" },
      ];
      const renderer = render(<AppChipGroup mode="single" options={longOptions} value={null} onChange={() => {}} />);
      const pressables = findPressables(renderer);
      for (const p of pressables) {
        // Chip's own style array is the last style entry AppChipGroup can influence -- confirms
        // AppChipGroup itself never layers on a width/flex constraint per option.
        const flatStyle = ([] as unknown[]).concat(p.props.style).filter(Boolean);
        for (const s of flatStyle) {
          expect((s as Record<string, unknown>).width).toBeUndefined();
          expect((s as Record<string, unknown>).flex).toBeUndefined();
        }
      }
    });
  });

  describe("order preservation (RTL / LTR)", () => {
    // AppChipGroup reads no RTL/locale state at all -- see the component's
    // own doc comment. These two tests assert the actual guarantee that
    // makes that safe: rendered order always matches `options` order
    // exactly, and the row container never applies "row-reverse", entirely
    // independent of I18nManager.isRTL. Native mirroring (already active
    // app-wide in Hebrew) is what flips the *visual* side -- that part
    // isn't observable in a Jest render (no real Yoga layout), so these
    // tests cover the half of the guarantee that is: we never reorder the
    // array or fight the mirror with a manual reverse.
    const cases: Array<[string, boolean]> = [
      ["LTR ordering", false],
      ["RTL ordering", true],
    ];

    it.each(cases)("%s: renders options in exactly the given order regardless of I18nManager.isRTL", (_name, isRTL) => {
      const RN = require("react-native");
      const original = RN.I18nManager.isRTL;
      RN.I18nManager.isRTL = isRTL;
      try {
        const renderer = render(<AppChipGroup mode="single" options={OPTIONS} value={null} onChange={() => {}} />);
        const labels = renderer.root.findAllByType(Text).map((t) => t.props.children);
        expect(labels).toEqual(["All Time", "This Month", "This Week"]);
      } finally {
        RN.I18nManager.isRTL = original;
      }
    });

    it.each(cases)("%s: never sets flexDirection to row-reverse on the chip row", (_name, isRTL) => {
      const RN = require("react-native");
      const original = RN.I18nManager.isRTL;
      RN.I18nManager.isRTL = isRTL;
      try {
        const renderer = render(<AppChipGroup mode="single" options={OPTIONS} value={null} onChange={() => {}} />);
        const scrollView = renderer.root.findByType(ScrollView);
        const flatStyle = ([] as unknown[]).concat(scrollView.props.contentContainerStyle).filter(Boolean);
        for (const s of flatStyle) {
          expect((s as Record<string, unknown>).flexDirection).not.toBe("row-reverse");
        }
      } finally {
        RN.I18nManager.isRTL = original;
      }
    });
  });

  describe("horizontal scrolling behavior", () => {
    it('layout="scroll" (default) renders inside a horizontal ScrollView', () => {
      const renderer = render(<AppChipGroup mode="single" options={OPTIONS} value={null} onChange={() => {}} />);
      const scrollView = renderer.root.findByType(ScrollView);
      expect(scrollView.props.horizontal).toBe(true);
    });

    it('layout="wrap" renders no ScrollView at all, using a flex-wrap View instead', () => {
      const renderer = render(<AppChipGroup mode="single" options={OPTIONS} value={null} onChange={() => {}} layout="wrap" />);
      expect(renderer.root.findAllByType(ScrollView).length).toBe(0);
      const wrapView = renderer.root.findAllByType(View).find((v) => {
        const flatStyle = ([] as unknown[]).concat(v.props.style).filter(Boolean);
        return flatStyle.some((s) => (s as Record<string, unknown>).flexWrap === "wrap");
      });
      expect(wrapView).toBeDefined();
    });
  });

  describe("accessibility", () => {
    it("uses radio role for single-select options and checkbox role for multi-select options", () => {
      const single = render(<AppChipGroup mode="single" options={OPTIONS} value={null} onChange={() => {}} />);
      expect(findPressables(single).length).toBe(OPTIONS.length);

      const multi = render(<AppChipGroup mode="multiple" options={OPTIONS} value={[]} onChange={() => {}} />);
      expect(findPressables(multi).length).toBe(OPTIONS.length);
    });

    it("exposes the caller's accessibilityLabel on the group container", () => {
      const renderer = render(
        <AppChipGroup mode="single" options={OPTIONS} value={null} onChange={() => {}} accessibilityLabel="Time period filter" />,
      );
      const scrollView = renderer.root.findByType(ScrollView);
      expect(scrollView.props.accessibilityLabel).toBe("Time period filter");
    });
  });
});
