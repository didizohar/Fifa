import { StyleSheet, Text, View } from "react-native";
import { spacing, typography } from "../theme";
import { Badge, type BadgeTone } from "./Badge";
import { Card } from "./Card";

interface HighlightCardProps {
  label: string;
  name: string;
  badgeLabel: string;
  badgeTone?: BadgeTone;
}

/** Compact "eyebrow label + name + badge" card -- Home's Top Performer / Top This Month, reusable anywhere a single standout fact needs a small callout. */
export function HighlightCard({ label, name, badgeLabel, badgeTone = "accent" }: HighlightCardProps) {
  return (
    <Card compact variant="elevated" style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.name} numberOfLines={1}>
        {name}
      </Text>
      <Badge label={badgeLabel} tone={badgeTone} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    gap: spacing.xs,
  },
  label: {
    ...typography.eyebrow,
  },
  name: {
    ...typography.bodyStrong,
  },
});
