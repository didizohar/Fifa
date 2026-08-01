import { Profiler, ProfilerOnRenderCallback, ReactNode, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

interface Stats {
  renders: number;
  last: number;
  max: number;
  mean: number;
  total: number;
}

/**
 * Dev-only, on-screen render/FPS readout -- __DEV__-gated so it never ships
 * in a release/TestFlight build. Wrap a screen's scrollable content in this
 * to see, live on the device, how many times it re-rendered, how long each
 * commit took (React Profiler's actualDuration), and the JS-thread frame
 * rate while interacting -- real numbers instead of guessing at "feels
 * heavy". Remove once a screen's perf work is validated.
 */
export function PerfOverlay({ id, children }: { id: string; children: ReactNode }) {
  if (!__DEV__) return <>{children}</>;
  return <PerfOverlayInner id={id}>{children}</PerfOverlayInner>;
}

function PerfOverlayInner({ id, children }: { id: string; children: ReactNode }) {
  const statsRef = useRef<Stats>({ renders: 0, last: 0, max: 0, mean: 0, total: 0 });
  const fpsRef = useRef(60);
  const [, forceTick] = useState(0);

  useEffect(() => {
    let frames = 0;
    let windowStart = Date.now();
    let raf: ReturnType<typeof requestAnimationFrame>;
    const loop = () => {
      frames++;
      const now = Date.now();
      const elapsed = now - windowStart;
      if (elapsed >= 500) {
        fpsRef.current = Math.round((frames * 1000) / elapsed);
        frames = 0;
        windowStart = now;
        forceTick((t) => t + 1);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const onRender: ProfilerOnRenderCallback = (_profilerId, _phase, actualDuration) => {
    const s = statsRef.current;
    s.renders += 1;
    s.last = actualDuration;
    s.max = Math.max(s.max, actualDuration);
    s.total += actualDuration;
    s.mean = s.total / s.renders;
    forceTick((t) => t + 1);
  };

  const s = statsRef.current;
  return (
    <>
      <Profiler id={id} onRender={onRender}>
        {children}
      </Profiler>
      <View style={styles.badge} pointerEvents="none">
        <Text style={styles.text}>{id}</Text>
        <Text style={styles.text}>
          renders {s.renders} · fps {fpsRef.current}
        </Text>
        <Text style={styles.text}>
          last {s.last.toFixed(1)}ms · max {s.max.toFixed(1)}ms · avg {s.mean.toFixed(1)}ms
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
