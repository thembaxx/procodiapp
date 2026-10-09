"use client";

import { useEffect, useRef, type PointerEvent } from "react";
import { motion } from "motion/react";
import { useTheme } from "next-themes";
import {
  Cancel01Icon,
  Settings02Icon,
  Sun01Icon,
  Moon02Icon,
  ComputerIcon,
  SparklesIcon,
  Tick02Icon,
  ArrowRight01Icon,
} from "@hugeicons/core-free-icons";
import { Icon } from "@/components/icon";
import { designs } from "@/lib/designs";
import type { Design } from "@/lib/appearance";
import { useMotionPreference } from "@/components/use-motion-preference";
import { PwaControls } from "@/components/pwa-controls";

export function ViewSettings({
  open,
  onClose,
  design,
  onDesign,
  effects,
  onEffects,
  ready,
}: {
  open: boolean;
  onClose: () => void;
  design: Design;
  onDesign: (design: Design) => void;
  effects: boolean;
  onEffects: (enabled: boolean) => void;
  ready: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const start = useRef<number | null>(null);
  const dragged = useRef(false);
  const wasOpen = useRef(false);
  const { theme, setTheme } = useTheme();
  const reduced = useMotionPreference();
  const activeTheme = ready ? theme || "dark" : "dark";

  useEffect(() => {
    const node = dialog.current;
    if (!open) {
      node?.close();
      if (wasOpen.current)
        document
          .querySelector<HTMLButtonElement>('button[aria-controls="view-settings"]')
          ?.focus({ preventScroll: true });
      wasOpen.current = false;
      return;
    }
    node?.showModal();
    wasOpen.current = true;
    const overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = overflow;
    };
  }, [open]);

  const finishDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (start.current === null) return;
    const offset = Math.max(0, event.clientY - start.current);
    start.current = null;
    dialog.current?.removeAttribute("data-dragging");
    dialog.current?.style.removeProperty("--drag-offset");
    if (offset > 70) onClose();
  };

  return (
    <dialog
      ref={dialog}
      id="view-settings"
      className="settings-dialog"
      aria-labelledby="settings-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onPointerDown={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        ) {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <button
        className="settings-drag-handle"
        aria-label="Dismiss settings"
        onPointerDown={(event) => {
          start.current = event.clientY;
          dragged.current = false;
          event.currentTarget.setPointerCapture(event.pointerId);
          dialog.current?.setAttribute("data-dragging", "true");
        }}
        onPointerMove={(event) => {
          if (start.current === null) return;
          const offset = Math.min(240, Math.max(0, event.clientY - start.current));
          if (offset > 8) dragged.current = true;
          dialog.current?.style.setProperty("--drag-offset", `${offset}px`);
        }}
        onPointerUp={finishDrag}
        onPointerCancel={() => {
          start.current = null;
          dialog.current?.removeAttribute("data-dragging");
          dialog.current?.style.removeProperty("--drag-offset");
        }}
        onClick={() => {
          if (!dragged.current) onClose();
        }}
      >
        <span />
      </button>
      <div className="settings-content">
        <div className="settings-heading">
          <span className="settings-emblem">
            <Icon icon={Settings02Icon} size={23} />
          </span>
          <button className="icon-button" aria-label="Close view settings" onClick={onClose}>
            <Icon icon={Cancel01Icon} />
          </button>
        </div>
        <span className="eyebrow">MAKE YOURSELF AT HOME</span>
        <h2 id="settings-title">Your kind of saving.</h2>
        <p className="settings-intro">Same offers. A view that feels like you.</p>
        <fieldset className="view-choices">
          <legend>Choose your view</legend>
          {designs.map((item) => (
            <motion.button
              key={item.id}
              className={`view-choice ${design === item.id ? "is-selected" : ""}`}
              aria-label={item.name}
              aria-pressed={design === item.id}
              onClick={() => onDesign(item.id)}
              whileHover={reduced ? undefined : { y: -2 }}
              whileTap={reduced ? undefined : { scale: 0.98 }}
            >
              <span className={`view-preview preview-${item.id}`} aria-hidden="true">
                <i />
                <i />
                <i />
                <Icon icon={item.icon} size={19} />
              </span>
              <span className="view-choice-copy">
                <strong>{item.name}</strong>
                <span>{item.description}</span>
                <small>{item.scene}</small>
              </span>
              <span className="view-choice-check" aria-hidden="true">
                {design === item.id && <Icon icon={Tick02Icon} size={16} />}
              </span>
            </motion.button>
          ))}
        </fieldset>
        <fieldset className="theme-choices">
          <legend>Set the mood</legend>
          <div>
            {[
              { id: "light", name: "Light", icon: Sun01Icon },
              { id: "dark", name: "Dark", icon: Moon02Icon },
              { id: "system", name: "System", icon: ComputerIcon },
            ].map((item) => (
              <button
                key={item.id}
                aria-label={`${item.name} theme`}
                aria-pressed={activeTheme === item.id}
                className={activeTheme === item.id ? "is-selected" : ""}
                onClick={() => setTheme(item.id)}
              >
                <Icon icon={item.icon} size={17} />
                {item.name}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="effects-setting">
          <span className="effects-icon">
            <Icon icon={SparklesIcon} size={21} />
          </span>
          <div>
            <strong>Animated backgrounds</strong>
            <p>
              {reduced ? "Your device prefers less motion." : "A little movement, a little magic."}
            </p>
          </div>
          <button
            className="toggle-switch"
            role="switch"
            aria-label="Animated backgrounds"
            aria-checked={effects && !reduced}
            disabled={!!reduced}
            onClick={() => onEffects(!effects)}
          >
            <span />
          </button>
        </div>
        <PwaControls />
        <button className="settings-done primary-button" onClick={onClose}>
          Back to offers <Icon icon={ArrowRight01Icon} size={18} />
        </button>
        <p className="settings-footnote">Your view is saved on this device.</p>
      </div>
    </dialog>
  );
}
