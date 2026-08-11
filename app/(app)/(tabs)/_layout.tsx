import { Tabs } from "expo-router";
import { TabBarIcon } from "../../../src/components/TabBarIcon";
import { useTranslation } from "../../../src/lib/i18n";
import { useTheme } from "../../../src/theme/ThemeContext";

export default function TabsLayout() {
  const { t } = useTranslation();
  const { colors, iconSize } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.borderSubtle,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },
        tabBarItemStyle: {
          paddingTop: 4,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("nav.home"),
          tabBarIcon: ({ color, focused }) => <TabBarIcon name="home" outlineName="home-outline" focused={focused} color={color} size={iconSize.xl} />,
        }}
      />
      {/* Visual order/labels match the Couch League concept's bottom nav
          (Home, League, History, Players, More) -- same 5 existing routes,
          only reordered and relabeled (see nav.leaderboards/nav.settings
          translation values), nothing removed or restructured. */}
      <Tabs.Screen
        name="leaderboards"
        options={{
          title: t("nav.leaderboards"),
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="trophy" outlineName="trophy-outline" focused={focused} color={color} size={iconSize.xl} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: t("nav.history"),
          tabBarIcon: ({ color, focused }) => <TabBarIcon name="time" outlineName="time-outline" focused={focused} color={color} size={iconSize.xl} />,
        }}
      />
      <Tabs.Screen
        name="players"
        options={{
          title: t("nav.players"),
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="people" outlineName="people-outline" focused={focused} color={color} size={iconSize.xl} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t("nav.settings"),
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="ellipsis-horizontal" outlineName="ellipsis-horizontal-outline" focused={focused} color={color} size={iconSize.xl} />
          ),
        }}
      />
    </Tabs>
  );
}
