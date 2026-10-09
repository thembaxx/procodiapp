"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
type WorkerState = "preparing" | "ready" | "unavailable" | "failed";
type PwaState = {
  online: boolean;
  installed: boolean;
  ios: boolean;
  canInstall: boolean;
  installing: boolean;
  workerState: WorkerState;
  offlineReady: boolean;
  snapshotReady: boolean | null;
  updateReady: boolean;
  updating: boolean;
  install: () => Promise<boolean>;
  update: () => void;
  markSnapshotReady: (ready: boolean) => void;
};
const PwaContext = createContext<PwaState | null>(null);
const onlineSnapshot = () => navigator.onLine;
const serverOnline = () => true;
const serverFalse = () => false;
const subscribePlatform = () => () => {};
const iosSnapshot = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standaloneSnapshot = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  !!(navigator as Navigator & { standalone?: boolean }).standalone;
function subscribeStandalone(changed: () => void) {
  const media = window.matchMedia("(display-mode: standalone)");
  media.addEventListener("change", changed);
  return () => media.removeEventListener("change", changed);
}
function subscribeOnline(changed: () => void) {
  window.addEventListener("online", changed);
  window.addEventListener("offline", changed);
  return () => {
    window.removeEventListener("online", changed);
    window.removeEventListener("offline", changed);
  };
}

export function PwaProvider({ children }: { children: ReactNode }) {
  const online = useSyncExternalStore(subscribeOnline, onlineSnapshot, serverOnline);
  const [installedHere, setInstalled] = useState(false);
  const standalone = useSyncExternalStore(subscribeStandalone, standaloneSnapshot, serverFalse);
  const installed = standalone || installedHere;
  const ios = useSyncExternalStore(subscribePlatform, iosSnapshot, serverFalse);
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installing, setInstalling] = useState(false);
  const [workerState, setWorkerState] = useState<WorkerState>("preparing");
  const [snapshotReady, markSnapshotReady] = useState<boolean | null>(null);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [updating, setUpdating] = useState(false);
  const reloadRequested = useRef(false);

  useEffect(() => {
    document.documentElement.dataset.display = standalone ? "standalone" : "browser";
  }, [standalone]);

  useEffect(() => {
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallEvent);
    };
    const didInstall = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", didInstall);
    return () => {
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", didInstall);
    };
  }, []);

  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator) ||
      !window.isSecureContext
    ) {
      const frame = requestAnimationFrame(() => setWorkerState("unavailable"));
      return () => cancelAnimationFrame(frame);
    }
    let cancelled = false;
    let registration: ServiceWorkerRegistration | undefined;
    const removals: (() => void)[] = [];
    const watch = (worker: ServiceWorker | null) => {
      if (!worker) return;
      const changed = () => {
        if (cancelled) return;
        if (worker.state === "installed" && navigator.serviceWorker.controller) setWaiting(worker);
        if (worker.state === "activated") setWorkerState("ready");
        if (worker.state === "redundant" && !registration?.active) setWorkerState("failed");
      };
      worker.addEventListener("statechange", changed);
      removals.push(() => worker.removeEventListener("statechange", changed));
      changed();
    };
    const register = () =>
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((value) => {
          if (cancelled) return;
          registration = value;
          if (value.active?.state === "activated") setWorkerState("ready");
          if (value.waiting) setWaiting(value.waiting);
          watch(value.installing);
          const found = () => watch(value.installing);
          value.addEventListener("updatefound", found);
          removals.push(() => value.removeEventListener("updatefound", found));
        })
        .catch(() => {
          if (!cancelled)
            setWorkerState(
              navigator.serviceWorker.controller?.state === "activated" ? "ready" : "failed",
            );
        });
    void register();
    const controlled = () => {
      if (reloadRequested.current) window.location.reload();
      else {
        setWorkerState("ready");
        setWaiting(null);
      }
    };
    const check = () => {
      if (!document.hidden && navigator.onLine) {
        if (registration) void registration.update().catch(() => {});
        else void register();
      }
    };
    navigator.serviceWorker.addEventListener("controllerchange", controlled);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("online", check);
    const timer = setInterval(check, 60 * 60 * 1000);
    return () => {
      cancelled = true;
      removals.forEach((remove) => remove());
      clearInterval(timer);
      navigator.serviceWorker.removeEventListener("controllerchange", controlled);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("online", check);
    };
  }, []);

  const install = useCallback(async () => {
    if (!prompt) return false;
    setInstalling(true);
    try {
      await prompt.prompt();
      await prompt.userChoice;
      return true;
    } catch {
      return false;
    } finally {
      setInstalling(false);
      setPrompt(null);
    }
  }, [prompt]);
  const update = useCallback(() => {
    if (!waiting || !navigator.onLine || updating) return;
    reloadRequested.current = true;
    setUpdating(true);
    waiting.postMessage({ type: "SKIP_WAITING" });
  }, [waiting, updating]);

  return (
    <PwaContext.Provider
      value={{
        online,
        installed,
        ios,
        canInstall: !!prompt,
        installing,
        workerState,
        offlineReady: workerState === "ready" && snapshotReady === true,
        snapshotReady,
        updateReady: !!waiting,
        updating,
        install,
        update,
        markSnapshotReady,
      }}
    >
      {children}
    </PwaContext.Provider>
  );
}

export function usePwa() {
  const value = useContext(PwaContext);
  if (!value) throw new Error("PWA controls require the app provider.");
  return value;
}
