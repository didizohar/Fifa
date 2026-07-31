import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "../lib/i18n";
import { colors, radius, spacing, typography } from "../theme";

interface InfoTooltipProps {
  /** Section/metric name, shown as the modal's own subtitle. */
  title: string;
  howCalculated: string;
  matchesIncluded: string;
  whenUpdates: string;
  whyUseful: string;
}

/**
 * A small (i) icon that opens a modal explaining how a stat/section is
 * calculated -- every analytics section gets one of these instead of
 * expecting a user to guess what a number means. Built on RN's own Modal,
 * no extra dependency (same approach the deleted-then-rebuilt-when-needed
 * ModalSheet used).
 */
export function InfoTooltip({ title, howCalculated, matchesIncluded, whenUpdates, whyUseful }: InfoTooltipProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setVisible(true)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t("metrics.infoModalTitle")}
        style={styles.iconButton}
      >
        <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} />
      </Pressable>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setVisible(false)} accessibilityRole="button" accessibilityLabel={t("common.close")} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={() => setVisible(false)} accessibilityRole="button" accessibilityLabel={t("common.close")} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          <InfoRow label={t("metrics.howCalculated")} value={howCalculated} />
          <InfoRow label={t("metrics.matchesIncluded")} value={matchesIncluded} />
          <InfoRow label={t("metrics.whenUpdates")} value={whenUpdates} />
          <InfoRow label={t("metrics.whyUseful")} value={whyUseful} />
        </View>
      </Modal>
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    padding: 2,
  },
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
  },
  sheet: {
    backgroundColor: colors.surfaceElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    ...typography.heading,
    flexShrink: 1,
  },
  row: {
    gap: spacing.xs,
  },
  rowLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "700",
  },
  rowValue: {
    ...typography.body,
  },
});
