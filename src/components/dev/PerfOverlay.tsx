import { Profiler, ProfilerOnRenderCallback, ReactNode, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

interface Stats {
  renders: number;
  last: number;
  max: number;
  mean: number;
  total: number;
}

interface DisplayStats {
  renders: number;
  last: number;
  max: number;
  mean: number;
  fps: number;
}

const UPDATE_INTERVAL_MS = 1000;

const INITIAL_DISPLAY: DisplayStats = { renders: 0, last: 0, max: 0, mean: 0, fps: 60 };

/**
 * Dev-only, on-screen render/FPS readout -- __DEV__-gated so it never ships
 * in a release/TestFlight build. Wrap a screen's scrollable content in this
 * to see, live on the device, how many times it re-rendered, how long each
 * commit took (React Profiler's actualDuration), and the JS-thread frame
 * rate while interacting -- real numbers instead of guessing at "feels
 * heavy". Remove once a screen's perf work is validated.
 *
 * Measuring must never itself cause more rendering to measure: onRender and
 * the per-frame counter below only ever write to refs. A single
 * setInterval, decoupled from both the Profiler and the frame loop, is the
 * only thing that calls setState, at a fixed throttled cadence -- so this
 * overlay's own render count stays flat regardless of how often the
 * profiled subtree or the animation frame actually fire.
 */
export function PerfOverlay({ id, children }: { id: string; children: ReactNode }) {
  if (!__DEV__) return <>{children}</>;
  return <PerfOverlayInner id={id}>{children}</PerfOverlayInner>;
}

function PerfOverlayInner({ id, children }: { id: string; children: ReactNode }) {
  const statsRef = useRef<Stats>({ renders: 0, last: 0, max: 0, mean: 0, total: 0 });
  const frameCountRef = useRef(0);
  const [display, setDisplay] = useState<DisplayStats>(INITIAL_DISPLAY);

  useEffect(() => {
    let raf: ReturnType<typeof requestAnimationFrame>;
    const frameLoop = () => {
      frameCountRef.current += 1;
      raf = requestAnimationFrame(frameLoop);
    };
    raf = requestAnimationFrame(frameLoop);

    const interval = setInterval(() => {
      const fps = Math.round((frameCountRef.current * 1000) / UPDATE_INTERVAL_MS);
      frameCountRef.current = 0;
      const s = statsRef.current;
      setDisplay({ renders: s.renders, last: s.last, max: s.max, mean: s.mean, fps });
    }, UPDATE_INTERVAL_MS);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(interval);
    };
  }, []);

  // Refs only, deliberately -- calling setState here would re-render this
  // component, which re-commits the Profiler's own subtree, which would
  // fire onRender again, which would call setState again: an unbounded
  // "Maximum update depth exceeded" loop. The setInterval above is the only
  // path that ever calls setState.
  const onRender: ProfilerOnRenderCallback = (_profilerId, _phase, actualDuration) => {
    const s = statsRef.current;
    s.renders += 1;
    s.last = actualDuration;
    s.max = Math.max(s.max, actualDuration);
    s.total += actualDuration;
    s.mean = s.total / s.renders;
  };

  return (
    <>
      <Profiler id={id} onRender={onRender}>
        {children}
      </Profiler>
      <View style={styles.badge} pointerEvents="none">
        <Text style={styles.text}>{id}</Text>
        <Text style={styles.text}>
          renders {display.renders} · fps {display.fps}
        </Text>
        <Text style={styles.text}>
          last {display.last.toFixed(1)}ms · max {display.max.toFixed(1)}ms · avg {display.mean.toFixed(1)}ms
        </Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    top: 46,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.78)",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    zIndex: 9999,
    elevation: 9999,
  },
  text: {
    color: "#5CFF7A",
    fontSize: 10,
    fontVariant: ["tabular-nums"],
  },
});
