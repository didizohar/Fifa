import { StyleSheet, View } from "react-native";
import { spacing } from "../theme";

/** A plain spacer row for FlatList's ItemSeparatorComponent -- a stable module-level component instead of an inline arrow function, so FlatList doesn't remount a new component type on every render. */
export function ListSeparator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  separator: {
    height: spacing.sm,
  },
});
