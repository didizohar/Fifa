import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

interface AvatarProps {
  uri?: string | null;
  name: string;
  color?: string;
  size?: number;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function Avatar({ uri, name, color = colors.accent, size = 44 }: AvatarProps) {
  const dimensionStyle = { width: size, height: size, borderRadius: size / 2 };

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[styles.image, dimensionStyle]}
        contentFit="cover"
        transition={150}
      />
    );
  }

  return (
    <View style={[styles.fallback, dimensionStyle, { backgroundColor: withAlpha(color) }]}>
      <Text style={[styles.initials, { fontSize: size * 0.38, color }]}>{getInitials(name)}</Text>
    </View>
  );
}

function withAlpha(hex: string): string {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return colors.accentSubtle;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, 0.18)`;
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: colors.surfaceElevated,
  },
  fallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    fontWeight: "700",
  },
});
