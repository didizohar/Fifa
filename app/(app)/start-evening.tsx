import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { AnimatedPressable } from "../../src/components/AnimatedPressable";
import { Chevron } from "../../src/components/Chevron";
import { Screen } from "../../src/components/Screen";
import { useGroup } from "../../src/hooks/useGroup";
import { useLastWinnersStayParticipants } from "../../src/hooks/useLastWinnersStayParticipants";
import { usePlayers } from "../../src/hooks/usePlayers";
import { notify } from "../../src/lib/confirm";
import { useTranslation } from "../../src/lib/i18n";
import { colors, radius, spacing, typography } from "../../src/theme";

/** Same "enough players to actually run a session" floor Winners Stay's own setup screen already enforces (2 pairs minimum). */
const MIN_PARTICIPANTS = 4;

export default function StartEveningScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { currentGroupId } = useGroup();
  const players = usePlayers(currentGroupId);
  const { participantIds: lastParticipantIds } = useLastWinnersStayParticipants(currentGroupId);

  const hasPreviousSession = lastParticipantIds.length > 0;

  const handleNewSession = () => {
    // Plain push, no params -- lands on Winners Stay's own setup screen
    // with nothing preselected, exactly like navigating there directly.
    router.replace("/winners-stay");
  };

  const handleContinuePrevious = () => {
    const activeIds = new Set((players.data ?? []).map((p) => p.id));
    const validIds = lastParticipantIds.filter((id) => activeIds.has(id));

    if (validIds.length < lastParticipantIds.length) {
      notify(t("rotation.startEveningPlayersRemovedNotice"));
    }

    if (validIds.length < MIN_PARTICIPANTS) {
      // Too few of the previous participants are still active -- fall
      // through to a normal, empty player selection rather than starting
      // Winners Stay's setup screen with an unusably small preselection.
      router.replace("/winners-stay");
      return;
    }

    router.replace({ pathname: "/winners-stay", params: { preselectPlayerIds: validIds.join(",") } });
  };

  return (
    <Screen>
      <Text style={styles.title}>{t("rotation.startEveningTitle")}</Text>
      <Text style={styles.subtitle}>{t("rotation.startEveningSubtitle")}</Text>

      <View style={styles.cards}>
        <ChoiceCard
          title={t("rotation.startEveningNewSession")}
          description={t("rotation.startEveningNewSessionDescription")}
          onPress={handleNewSession}
        />
        {hasPreviousSession ? (
          <ChoiceCard
            title={t("rotation.startEveningContinueSession")}
            description={t("rotation.startEveningContinueSessionDescription")}
            onPress={handleContinuePrevious}
          />
        ) : null}
      </View>
    </Screen>
  );
}

function ChoiceCard({ title, description, onPress }: { title: string; description: string; onPress: () => void }) {
  return (
    <AnimatedPressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${description}`}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.cardText}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardDescription}>{description}</Text>
      </View>
      <Chevron direction="forward" size={22} color={colors.accent} />
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  title: {
    ...typography.title,
    textAlign: "center",
    marginTop: spacing.md,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  cards: {
    gap: spacing.md,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    minHeight: 88,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface,
  },
  cardPressed: {
    backgroundColor: colors.surfaceElevated,
  },
  cardText: {
    flex: 1,
    gap: spacing.xs,
  },
  cardTitle: {
    ...typography.heading,
  },
  cardDescription: {
    ...typography.small,
    color: colors.textSecondary,
  },
});
