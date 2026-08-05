import { Ionicons } from "@expo/vector-icons";
import { memo, type ComponentProps } from "react";
import { ScrollView, StyleSheet, View, ViewStyle } from "react-native";
import { spacing } from "../theme";
import { Chip } from "./Chip";

export interface ChipOption<T extends string = string> {
  id: T;
  label: string;
  icon?: ComponentProps<typeof Ionicons>["name"];
  disabled?: boolean;
}

interface AppChipGroupBase<T extends string> {
  options: ChipOption<T>[];
  /** "scroll" (default): horizontal ScrollView, matches every existing chip row in the app. "wrap": chips flow onto multiple lines instead, nothing scrolls. */
  layout?: "scroll" | "wrap";
  /** Describes the group's purpose for screen readers, e.g. "Time period filter" -- RN has no native radiogroup role, this is the practical substitute. */
  accessibilityLabel?: string;
  style?: ViewStyle;
  testID?: string;
}

interface AppChipGroupSingleProps<T extends string> extends AppChipGroupBase<T> {
  mode: "single";
  value: T | null;
  onChange: (value: T) => void;
}

interface AppChipGroupMultiProps<T extends string> extends AppChipGroupBase<T> {
  mode: "multiple";
  /** Must be a stable reference when unchanged -- see the perf note above the component below. */
  value: T[];
  onChange: (value: T[]) => void;
}

export type AppChipGroupProps<T extends string = string> = AppChipGroupSingleProps<T> | AppChipGroupMultiProps<T>;

/**
 * The single shared component for filter/slicer chip rows. Renders each
 * option as the existing `Chip` (no style/animation duplication -- visual
 * appearance, press feedback, and the 44pt hit target all come from Chip
 * unchanged) and owns only selection state plumbing and row layout.
 *
 * RTL: deliberately does nothing locale-specific. `options` is rendered in
 * exactly the order given -- never reversed -- and the row uses a plain
 * `flexDirection: "row"` (never "row-reverse"). Native RTL mirroring
 * (I18nManager.forceRTL, already active app-wide whenever the locale is
 * Hebrew) is solely responsible for which physical side is visually first;
 * doing it again here would double-flip. See Chip.tsx's `icon` prop for the
 * same reasoning applied one level down.
 *
 * Perf: `options` (and `value` in "multiple" mode) must be stable
 * references when their contents haven't changed -- same contract already
 * documented on PlayerPicker's props in this codebase. The whole group is
 * wrapped in React.memo since it's a prop-driven leaf typically rendered
 * inside screens that re-render for unrelated reasons (a score tap, a
 * sibling section) -- same justification already used for PlayerPicker/
 * MatchSideCard/RankingRow. Individual Chip items are deliberately NOT
 * memoized: every current filter row in this app has 3-6 options, and
 * diffing that few Pressables on a selection change is microseconds of
 * work -- premature to optimize against a screen that doesn't exist yet.
 * Revisit only if a screen ships with a genuinely large (15+) option count.
 */
function AppChipGroupInner<T extends string = string>(props: AppChipGroupProps<T>) {
  const { options, layout = "scroll", accessibilityLabel, style, testID } = props;

  const handlePress = (option: ChipOption<T>) => {
    if (option.disabled) return;
    if (props.mode === "single") {
      props.onChange(option.id);
      return;
    }
    const next = props.value.includes(option.id) ? props.value.filter((v) => v !== option.id) : [...props.value, option.id];
    props.onChange(next);
  };

  const isActive = (option: ChipOption<T>) => (props.mode === "single" ? props.value === option.id : props.value.includes(option.id));

  const chips = options.map((option) => (
    <Chip
      key={option.id}
      label={option.label}
      icon={option.icon}
      active={isActive(option)}
      disabled={option.disabled}
      accessibilityRole={props.mode === "single" ? "radio" : "checkbox"}
      onPress={() => handlePress(option)}
    />
  ));

  if (layout === "wrap") {
    return (
      <View style={[styles.wrapRow, style]} accessibilityLabel={accessibilityLabel} testID={testID}>
        {chips}
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.scrollRow, style]}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {chips}
    </ScrollView>
  );
}

AppChipGroupInner.displayName = "AppChipGroup";

// React.memo erases a component's generic signature by default (the
// wrapped type is a plain NamedExoticComponent<P>, not a generic function),
// which would force every call site to lose literal-union inference on T.
// Casting back to `typeof AppChipGroupInner` restores it -- a standard,
// accepted pattern for memoizing generic components.
export const AppChipGroup = memo(AppChipGroupInner) as typeof AppChipGroupInner;

const styles = StyleSheet.create({
  scrollRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  wrapRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
});
