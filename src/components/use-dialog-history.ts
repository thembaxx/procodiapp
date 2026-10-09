"use client";

import { useCallback, useEffect, useRef } from "react";

// Android Back and browser Back dismiss a sheet before leaving the app.
export function useDialogHistory(open: boolean, id: string, dismiss: () => void) {
  const dismissRef = useRef(dismiss);
  useEffect(() => {
    dismissRef.current = dismiss;
  }, [dismiss]);
  useEffect(() => {
    if (!open) return;
    window.history.pushState(
      { ...window.history.state, groceryPanel: id },
      "",
      window.location.href,
    );
    const back = (event: PopStateEvent) => {
      if (window.history.state?.groceryPanel === id) return;
      // A sheet traversal stays in this document. Letting Next restore its route
      // tree here can request an RSC navigation while the offline shell is open.
      event.stopImmediatePropagation();
      const url = new URL(window.location.href);
      const design = document.documentElement.dataset.design;
      if (design) url.searchParams.set("design", design);
      window.history.replaceState(window.history.state, "", url);
      dismissRef.current();
    };
    window.addEventListener("popstate", back, true);
    return () => window.removeEventListener("popstate", back, true);
  }, [open, id]);
  return useCallback(() => {
    if (window.history.state?.groceryPanel === id) window.history.back();
    else dismissRef.current();
  }, [id]);
}
