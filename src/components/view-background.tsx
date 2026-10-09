"use client";

import { useEffect, useRef } from "react";
import { useMotionPreference } from "@/components/use-motion-preference";
import type { Design } from "@/lib/appearance";
import type { createViewScene } from "@/lib/view-scene";

type SceneController = NonNullable<ReturnType<typeof createViewScene>>;

export function ViewBackground({
  design,
  light,
  brand,
  enabled,
}: {
  design: Design;
  light: boolean;
  brand: string;
  enabled: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<SceneController | null>(null);
  const appearance = useRef({ design, light, brand });
  const reduced = useMotionPreference();

  useEffect(() => {
    appearance.current = { design, light, brand };
    controller.current?.setAppearance(appearance.current);
  }, [design, light, brand]);

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    if (!enabled || reduced !== false) {
      node.dataset.state = reduced ? "reduced" : "disabled";
      return;
    }
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } })
      .connection;
    if (connection?.saveData) {
      node.dataset.state = "data-saving";
      return;
    }
    let cancelled = false;
    let cleanUp = () => {};
    node.dataset.state = "loading";
    // Keep Three.js out of the initial page bundle and out of reduced-motion visits.
    const loadScene = () =>
      import("@/lib/view-scene")
        .then(({ createViewScene }) => {
          if (cancelled) return;
          const canvas = document.createElement("canvas");
          const scene = createViewScene(canvas, appearance.current);
          if (!scene) {
            node.dataset.state = "fallback";
            return;
          }
          controller.current = scene;
          node.appendChild(canvas);
          let lost = false;
          const resize = () => {
            scene.resize(node.clientWidth, node.clientHeight, window.devicePixelRatio || 1);
          };
          const visibility = () => {
            const running = !document.hidden && !lost;
            scene.setRunning(running);
            node.dataset.state = lost ? "fallback" : running ? "running" : "paused";
          };
          const pointer = (event: PointerEvent) => {
            if (event.pointerType === "mouse")
              scene.pointer(
                (event.clientX / innerWidth) * 2 - 1,
                1 - (event.clientY / innerHeight) * 2,
              );
          };
          const reset = () => scene.pointer(0, 0);
          const delight = () => scene.delight();
          const contextLost = (event: Event) => {
            event.preventDefault();
            lost = true;
            visibility();
          };
          const contextRestored = () => {
            lost = false;
            resize();
            visibility();
          };
          const observer = new ResizeObserver(resize);
          cleanUp = () => {
            observer.disconnect();
            document.removeEventListener("visibilitychange", visibility);
            window.removeEventListener("pointermove", pointer);
            document.removeEventListener("pointerleave", reset);
            window.removeEventListener("grocery:delight", delight);
            canvas.removeEventListener("webglcontextlost", contextLost);
            canvas.removeEventListener("webglcontextrestored", contextRestored);
            scene.dispose();
            canvas.remove();
            controller.current = null;
          };
          observer.observe(node);
          document.addEventListener("visibilitychange", visibility);
          window.addEventListener("pointermove", pointer, { passive: true });
          document.addEventListener("pointerleave", reset);
          window.addEventListener("grocery:delight", delight);
          canvas.addEventListener("webglcontextlost", contextLost);
          canvas.addEventListener("webglcontextrestored", contextRestored);
          resize();
          visibility();
        })
        .catch(() => {
          cleanUp();
          cleanUp = () => {};
          if (!cancelled) node.dataset.state = "fallback";
        });
    // Paint the useful content first. Decorative work can wait for idle time.
    let idle: number | undefined;
    const timer = window.setTimeout(() => {
      if ("requestIdleCallback" in window)
        idle = window.requestIdleCallback(() => void loadScene(), { timeout: 2000 });
      else void loadScene();
    }, 1200);
    return () => {
      window.clearTimeout(timer);
      if (idle !== undefined) window.cancelIdleCallback(idle);
      cancelled = true;
      cleanUp();
    };
  }, [enabled, reduced]);

  return (
    <div
      ref={host}
      className={`view-background background-${design}`}
      data-scene={design}
      aria-hidden="true"
    />
  );
}
