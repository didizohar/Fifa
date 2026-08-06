import { useIsFocused } from "expo-router";
import { useRef } from "react";

/**
 * Returns `value` while this screen is focused, and the value it last had
 * the moment focus was lost otherwise. React Navigation never unmounts a
 * screen just because another one was pushed on top of it -- a tab screen
 * (Dashboard, Leaderboards, History, Players) stays fully mounted, with its
 * own data queries still receiving fresh data in the background, for as
 * long as Record Match / Winners Stay / any other pushed screen sits above
 * it. Every useMemo/useCallback built from a query's `data` reference has
 * no way to know it's currently invisible, so it keeps re-running its full
 * cost (some of these are O(players * matches) trend/leaderboard
 * calculations) on every single background refetch -- e.g. after every
 * match saved anywhere in the app, since match-history invalidation isn't
 * scoped to whichever screen is actually focused. Wrapping the query data
 * in this hook keeps its reference stable while unfocused, so those
 * downstream computations skip re-running until the screen is actually
 * looked at again, without touching the query itself (still fetches
 * normally, so the very first render after regaining focus is already
 * fresh, not stale).
 */
export function useFocusFrozenValue<T>(value: T): T {
  const isFocused = useIsFocused();
  const frozenRef = useRef(value);
  if (isFocused) frozenRef.current = value;
  return frozenRef.current;
}
