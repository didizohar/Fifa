import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, radius, spacing, typography } from "../theme";
import { Avatar } from "./Avatar";

export interface PickablePlayer {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  color: string;
}

interface PlayerPickerProps {
  players: PickablePlayer[];
  selectedIds: string[];
  onToggle: (playerId: string) => void;
  disabledIds?: string[];
  maxSelected: number;
}

export function PlayerPicker({ players, selectedIds, onToggle, disabledIds = [], maxSelected }: PlayerPickerProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return players;
    return players.filter((p) => p.displayName.toLowerCase().includes(q));
  }, [players, query]);

  return (
    <View style={styles.container}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search players"
        placeholderTextColor={colors.textMuted}
        style={styles.search}
      />
      <View style={styles.list}>
        {filtered.map((player) => {
          const isSelected = selectedIds.includes(player.id);
          const isDisabled = disabledIds.includes(player.id) || (!isSelected && selectedIds.length >= maxSelected);
          return (
            <Pressable
              key={player.id}
              onPress={() => !isDisabled && onToggle(player.id)}
              disabled={isDisabled}
              accessibilityRole="checkbox"
              accessibilityLabel={player.displayName}
              accessibilityState={{ checked: isSelected, disabled: isDisabled }}
              style={({ pressed }) => [
                styles.row,
                isSelected && styles.rowSelected,
                isDisabled && !isSelected && styles.rowDisabled,
                pressed && !isDisabled && styles.rowPressed,
              ]}
            >
              <Avatar uri={player.avatarUrl} name={player.displayName} color={player.color} size={36} />
              <Text style={styles.name} numberOfLines={1}>{player.displayName}</Text>
              {isSelected ? <Text style={styles.check}>✓</Text> : null}
            </Pressable>
          );
        })}
        {filtered.length === 0 ? <Text style={styles.empty}>No players match "{query}"</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  search: {
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
  },
  list: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
  rowSelected: {
    backgroundColor: colors.accentSubtle,
    borderColor: colors.accent,
  },
  rowDisabled: {
    opacity: 0.35,
  },
  rowPressed: {
    backgroundColor: colors.surfaceElevated,
  },
  name: {
    ...typography.body,
    flex: 1,
  },
  check: {
    color: colors.accent,
    fontWeight: "700",
    fontSize: 16,
  },
  empty: {
    ...typography.caption,
    textAlign: "center",
    paddingVertical: spacing.lg,
  },
});
