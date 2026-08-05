import { useNavigation } from "expo-router";
import { StyleSheet, Text } from "react-native";
import { useTranslation } from "../lib/i18n";
import { ROUTE_TITLE_KEYS } from "../lib/routeTitles";
import { colors, spacing, typography } from "../theme";
import { AnimatedPressable } from "./AnimatedPressable";
import { Chevron } from "./Chevron";

/**
 * Custom header-left back button for every pushed (non-modal, non-tab)
 * screen in the (app) stack. Left alone, React Navigation's native back
 * button falls back to the PREVIOUS screen's own `title` option -- and
 * when that screen has none (e.g. the "(tabs)" group, which has no header
 * of its own), the fallback is the raw route name instead ("(tabs)"
 * verbatim). This reads the actual previous route out of this screen's
 * own navigation state and looks its title up in the same
 * ROUTE_TITLE_KEYS registry _layout.tsx uses for every screen's own
 * title, so the label is always correct and the two can never disagree.
 */
export function HeaderBackButton() {
  const navigation = useNavigation();
  const { t } = useTranslation();

  const state = navigation.getState();
  const previousRoute = state && state.index > 0 ? state.routes[state.index - 1] : undefined;
  const titleKey = previousRoute ? ROUTE_TITLE_KEYS[previousRoute.name] : undefined;
  const label = titleKey ? t("common.backTo", { screen: t(titleKey) }) : t("common.back");

  return (
    <AnimatedPressable
      onPress={() => navigation.goBack()}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={styles.button}
    >
      <Chevron direction="back" size={20} color={colors.accent} />
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    minHeight: 44,
    minWidth: 44,
    maxWidth: 170,
    paddingVertical: spacing.xs,
  },
  label: {
    ...typography.body,
    color: colors.accent,
    flexShrink: 1,
  },
});
