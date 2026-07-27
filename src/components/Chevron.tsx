import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { useTranslation } from "../lib/i18n";
import { colors } from "../theme";

interface ChevronProps {
  /** Logical direction independent of language: "back" = toward the start of reading order, "forward" = toward the end (e.g. a disclosure chevron, "next"). */
  direction: "back" | "forward";
  size?: number;
  color?: string;
}

/**
 * A chevron that points the right way in both LTR and RTL. Ionicons glyphs
 * don't mirror automatically with I18nManager the way layout does, so every
 * "back"/"forward"/"previous"/"next" chevron in the app should go through
 * this instead of hardcoding chevron-back/chevron-forward directly.
 */
export function Chevron({ direction, size = 20, color = colors.textPrimary }: ChevronProps) {
  const { isRTL } = useTranslation();
  const visualDirection = isRTL ? (direction === "back" ? "forward" : "back") : direction;
  const name: ComponentProps<typeof Ionicons>["name"] = visualDirection === "back" ? "chevron-back" : "chevron-forward";
  return <Ionicons name={name} size={size} color={color} />;
}
