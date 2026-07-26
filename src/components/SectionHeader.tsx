import { Text, View, StyleSheet } from "react-native";
import { colors, spacing, typography } from "../theme";

interface SectionHeaderProps {
  title: string;
  /** Optional trailing action, e.g. "See all". Omit for a plain title. */
  actionLabel?: string;
  onAction?: () => void;
}

/** Title + optional trailing action row, shared by every card-group section (Home, Draw screens, etc.). */
export function SectionHeader({ title, actionLabel, onAction }: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {actionLabel && onAction ? (
        <Text style={styles.action} onPress={onAction}>
          {actionLabel}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    ...typography.heading,
  },
  action: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: "600",
  },
});
