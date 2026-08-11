import { Image } from "expo-image";
import { useMemo } from "react";
import { Text, View } from "react-native";
import { useTheme } from "../theme/ThemeContext";

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

function withAlpha(hex: string, fallback: string): string {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return fallback;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, 0.18)`;
}

export function Avatar({ uri, name, color, size = 44 }: AvatarProps) {
  const { colors } = useTheme();
  const resolvedColor = color ?? colors.accent;
  const dimensionStyle = useMemo(() => ({ width: size, height: size, borderRadius: size / 2 }), [size]);

  if (uri) {
    return <Image source={{ uri }} style={[dimensionStyle, { backgroundColor: colors.surfaceElevated }]} contentFit="cover" transition={150} />;
  }

  return (
    <View style={[dimensionStyle, { alignItems: "center", justifyContent: "center", backgroundColor: withAlpha(resolvedColor, colors.accentSubtle) }]}>
      <Text style={{ fontWeight: "700", fontSize: size * 0.38, color: resolvedColor }}>{getInitials(name)}</Text>
    </View>
  );
}
