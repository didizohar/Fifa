import { StyleSheet, Text, View } from "react-native";
import { typography } from "../theme";
import { InfoBanner } from "./InfoBanner";

interface TrendExplanationCardProps {
  title: string;
  message: string;
}

/** A titled human-readable explanation -- reuses InfoBanner's body so every trend explanation looks and reads consistently with the M3 notice banners. */
export function TrendExplanationCard({ title, message }: TrendExplanationCardProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <InfoBanner tone="info" message={message} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  title: {
    ...typography.small,
  },
});
