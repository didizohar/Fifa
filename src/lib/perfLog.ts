/**
 * Temporary, DEV-only timestamped diagnostic logging for the Full Match
 * Draw -> Record Match -> Winners Stay freeze investigation. Not a
 * profiling UI, no re-renders triggered -- just console.log with
 * absolute timestamps so deltas between steps can be read directly out
 * of the Metro log. Remove once the investigation is done.
 */
export function perfLog(label: string) {
  if (__DEV__) console.log(`[PERF] ${label} t=${Date.now()}`);
}
