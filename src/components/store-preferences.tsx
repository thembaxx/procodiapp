"use client";

import { useState } from "react";
import { Reorder, motion, useDragControls } from "motion/react";
import { storeCatalogue } from "@/lib/store-catalogue";

const KEY = "procodiapp-selected-stores-v1";
export type SelectedStore = string;
export const defaultStoreIds = [
  "checkers",
  "pick-n-pay",
  "woolworths",
  "shoprite",
  "spar",
  "makro",
];

export function saveStoreSelection(ids: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    /* Storage is optional in private browsing. */
  }
}

export function readStoreSelection(): string[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (Array.isArray(raw)) {
      return [
        ...new Set(
          raw.filter(
            (id): id is string => typeof id === "string" && storeCatalogue.some((s) => s.id === id),
          ),
        ),
      ];
    }
  } catch {
    /* private mode */
  }
  return defaultStoreIds;
}

function StoreItem({ id, onRemove }: { id: string; onRemove: (id: string) => void }) {
  const controls = useDragControls();
  const store = storeCatalogue.find((item) => item.id === id);
  if (!store) return null;
  return (
    <Reorder.Item
      value={id}
      dragListener={false}
      dragControls={controls}
      whileDrag={{ scale: 1.025, boxShadow: "0 14px 30px #0004", zIndex: 5 }}
      className="store-preference-item"
    >
      <button
        className="store-drag-handle"
        type="button"
        aria-label={`Drag to reorder ${store.name}`}
        onPointerDown={(event) => controls.start(event)}
      >
        ⠿
      </button>
      <span className="store-preference-name">{store.name}</span>
      <span className="store-preference-category">{store.category}</span>
      <button type="button" onClick={() => onRemove(id)} aria-label={`Remove ${store.name}`}>
        Remove
      </button>
    </Reorder.Item>
  );
}

export function StorePreferences({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selectedSet = new Set(selected);
  const available = storeCatalogue.filter(
    (s) => !selectedSet.has(s.id) && s.name.toLowerCase().includes(search.toLowerCase()),
  );
  const update = (ids: string[]) => {
    onChange(ids);
    saveStoreSelection(ids);
  };
  return (
    <section className="store-preferences">
      <div className="store-preferences-heading">
        <div>
          <strong>My stores</strong>
          <p>{selected.length} selected · Drag to set your preferred order</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(!open);
            if (open) setSearch("");
          }}
          aria-expanded={open}
        >
          {open ? "Done" : "Manage stores"}
        </button>
      </div>
      {open && (
        <div className="store-preferences-panel">
          <Reorder.Group
            axis="y"
            values={selected}
            onReorder={update}
            className="store-preferences-list"
          >
            {selected.map((id) => (
              <StoreItem
                key={id}
                id={id}
                onRemove={(removeId) => update(selected.filter((item) => item !== removeId))}
              />
            ))}
          </Reorder.Group>
          <label htmlFor="add-store-search">Add a store</label>
          <input
            id="add-store-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search 34 stores"
          />
          <div className="store-add-list">
            {available.map((store) => (
              <motion.button
                key={store.id}
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => update([...selected, store.id])}
              >
                <span>{store.name}</span>
                <small>{store.category}</small>
                <b>+ Add</b>
              </motion.button>
            ))}
          </div>
          <p className="store-preferences-note">
            Your choices are saved on this device. Store selection filters your offers; shared
            scheduled scraping is configured separately.
          </p>
        </div>
      )}
    </section>
  );
}
