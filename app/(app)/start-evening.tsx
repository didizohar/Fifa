import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AnimatedPressable } from "../../src/components/AnimatedPressable";
import { Chevron } from "../../src/components/Chevron";
import { Screen } from "../../src/components/Screen";
import { useGroup } from "../../src/hooks/useGroup";
import { useLastWinnersStayParticipants } from "../../src/hooks/useLastWinnersStayParticipants";
import { usePlayers } from "../../src/hooks/usePlayers";
import { useWinnersStaySession } from "../../src/hooks/useWinnersStaySession";
import { useWinnersStaySessionHistory } from "../../src/hooks/useWinnersStaySessionHistory";
import { notify } from "../../src/lib/confirm";
import { useTranslation } from "../../src/lib/i18n";
import { archiveCompletedSession } from "../../src/lib/rotation/sessionHistory";
import { colors, radius, spacing, typography } from "../../src/theme";

/** Same floor Winners Stay's own setup screen enforces -- a session needs at least two players (duo). Three supports the "one waits" trio format; four or more is the original group/doubles format. */
const MIN_PARTICIPANTS = 2;

export default function StartEveningScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { currentGroupId } = useGroup();
  const players = usePlayers(currentGroupId);
  const { participantIds: lastParticipantIds } = useLastWinnersStayParticipants(currentGroupId);
  const { session, isHydrated: isSessionHydrated, setSession } = useWinnersStaySession(currentGroupId);
  const { history: sessionHistory, setHistory: setSessionHistory } = useWinnersStaySessionHistory(currentGroupId);

  // Ref (not just the isProcessing state below) so a second tap arriving
  // before the first has re-rendered still can't slip through -- the same
  // synchronous-guard pattern as record-match.tsx's submitGuardRef.
  const processingGuardRef = useRef(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const hasPreviousSession = lastParticipantIds.length > 0;
  // continuePreviousSession reads players.data to filter the previous
  // participant list -- tapping before it's loaded would see an empty
  // roster and wrongly treat every previous participant as archived/gone.
  const isReady = isSessionHydrated && !players.isLoading;

  /**
   * Archives (if there's anything to archive) and clears this group's
   * session slot, AWAITING the AsyncStorage write. This is the piece that
   * was missing before: start-evening.tsx and winners-stay.tsx each hold
   * their own separate instance of useWinnersStaySession, connected only
   * through the AsyncStorage key they both read/write -- not React state.
   * Navigating to Winners Stay right after a fire-and-forget setSession(null)
   * could land before the removal actually completed, so winners-stay.tsx's
   * own hydration read would still see the old (supposedly cleared) active
   * session and render IT instead of the fresh setup screen. Awaiting here
   * closes that race.
   */
  const clearSessionSlot = async () => {
    if (!session || session.groupId !== currentGroupId) return;
    // A session with zero recorded matches (roundNumber === 0) is only ever
    // a local draft -- participant selection alone, per Task 3's "a session
    // is real only once it has a saved match" rule. Archiving it would
    // pollute "Past Sessions" with an empty entry, so it's silently
    // discarded instead.
    if (session.roundNumber > 0) {
      setSessionHistory(archiveCompletedSession(sessionHistory, session, new Date().toISOString()));
    }
    await setSession(null);
  };

  /**
   * Option A -- always a genuinely new session: never reuses the previous
   * session's id, waiting queue, rotation state, pending match, score, or
   * club state, and never silently falls back to resuming anything. Any
   * existing session for this group (active OR completed -- either would
   * otherwise be picked up by Winners Stay's own "!session || completed"
   * setup-screen check) is archived and cleared first, so the setup screen
   * this navigates to is guaranteed empty.
   */
  const createNewSession = async () => {
    if (processingGuardRef.current) return;
    processingGuardRef.current = true;
    setIsProcessing(true);
    try {
      await clearSessionSlot();
      router.replace("/winners-stay");
      // Deliberately NOT resetting the guard/isProcessing here: this
      // screen is about to be replaced, so there's nothing to re-enable.
      // Resetting on success (even in a `finally`) would leave a window --
      // on a resume-style branch with no `await` before it, this executes
      // fully synchronously, so a second tap fired in the very same event
      // handler tick would see the guard already cleared and slip through,
      // firing a second, redundant navigation. Only a genuine failure
      // (below) needs the button usable again.
    } catch {
      processingGuardRef.current = false;
      setIsProcessing(false);
      notify(t("rotation.startEveningError"));
    }
  };

  /**
   * Option B -- one explicit rule, never a silent coin flip between resume
   * and create: if the group's most recent session is still active, resume
   * THAT SAME session (no mutation at all -- Winners Stay's own render
   * already shows the active-session UI for a "status: active" session, so
   * simply navigating there without touching its state IS resuming it,
   * including its real waiting queue/rotation/pending-match state). If the
   * most recent session is completed (or there isn't one), this is
   * honestly a NEW session -- same participants as last time, but a new id,
   * never presented as though the old completed session was reopened.
   */
  const continuePreviousSession = async () => {
    if (processingGuardRef.current) return;
    processingGuardRef.current = true;
    setIsProcessing(true);
    try {
      // Only resume a session that's actually recorded a match -- an active
      // session with roundNumber 0 is a local draft (participants picked,
      // nothing played yet), not a valid "previous session" to continue.
      // Falling through below discards it (clearSessionSlot) and instead
      // rebuilds from the last participant list that WAS captured after a
      // real match saved (see winners-stay.tsx's advance-session effect).
      if (session && session.status === "active" && session.roundNumber > 0 && session.groupId === currentGroupId) {
        router.replace("/winners-stay");
        return;
      }

      await clearSessionSlot();

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
      // See createNewSession's comment -- the guard is deliberately left
      // set after any successful navigation, not reset in a `finally`.
    } catch {
      processingGuardRef.current = false;
      setIsProcessing(false);
      notify(t("rotation.startEveningError"));
    }
  };

  return (
    <Screen>
      <Text style={styles.title}>{t("rotation.startEveningTitle")}</Text>
      <Text style={styles.subtitle}>{t("rotation.startEveningSubtitle")}</Text>

      <View style={styles.cards}>
        <ChoiceCard
          title={t("rotation.startEveningNewSession")}
          description={t("rotation.startEveningNewSessionDescription")}
          onPress={createNewSession}
          disabled={isProcessing || !isReady}
        />
        {hasPreviousSession ? (
          <ChoiceCard
            title={t("rotation.startEveningContinueSession")}
            description={t("rotation.startEveningContinueSessionDescription")}
            onPress={continuePreviousSession}
            disabled={isProcessing || !isReady}
          />
        ) : null}
      </View>
    </Screen>
  );
}

function ChoiceCard({
  title,
  description,
  onPress,
  disabled,
}: {
  title: string;
  description: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${description}`}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.card, disabled && styles.cardDisabled, pressed && !disabled && styles.cardPressed]}
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
  cardDisabled: {
    opacity: 0.5,
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
