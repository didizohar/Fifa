import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useMemo } from "react";
import { View } from "react-native";
import { useTheme } from "../theme/ThemeContext";

interface ClubCrestProps {
  /** clubs.logo_url -- null for the vast majority of clubs today (no upload flow exists yet), which is exactly what the shield-icon fallback below is for. Never fabricate a placeholder image URL. */
  logoUrl?: string | null;
  size?: number;
}

/** Circular club badge -- the real crest image when one exists, an elegant neutral shield otherwise. Never a random/fake placeholder shield pretending to be a specific club's real crest. */
export function ClubCrest({ logoUrl, size = 32 }: ClubCrestProps) {
  const { colors } = useTheme();
  const dimensionStyle = useMemo(() => ({ width: size, height: size, borderRadius: size / 2 }), [size]);

  if (logoUrl) {
    return <Image source={{ uri: logoUrl }} style={[dimensionStyle, { backgroundColor: colors.surfaceElevated }]} contentFit="contain" transition={150} />;
  }

  return (
    <View
      style={[
        dimensionStyle,
        { alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.borderSubtle },
      ]}
    >
      <Ionicons name="shield-outline" size={size * 0.55} color={colors.textMuted} />
    </View>
  );
}
