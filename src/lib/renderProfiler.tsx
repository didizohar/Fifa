import { Profiler, ReactNode } from "react";

/**
 * Temporary, DEV-only, whole-app freeze investigation. Logs any commit
 * whose actualDuration exceeds a small threshold, via plain console.log --
 * deliberately no setState anywhere in here (that's what caused the
 * "Maximum update depth exceeded" loop in the earlier PerfOverlay attempt).
 * No visual UI, nothing that itself triggers a re-render. Remove once the
 * investigation is done.
 */
export function RenderProfiler({ id, children }: { id: string; children: ReactNode }) {
  if (!__DEV__) return <>{children}</>;
  return (
    <Profiler
      id={id}
      onRender={(_id, phase, actualDuration) => {
        if (actualDuration > 4) {
          console.log(`[PROFILE] ${id} phase=${phase} actualDuration=${actualDuration.toFixed(1)}ms t=${Date.now()}`);
        }
      }}
    >
      {children}
    </Profiler>
  );
}
