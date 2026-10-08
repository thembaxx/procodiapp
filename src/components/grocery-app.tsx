"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, animate, motion, useReducedMotion } from "motion/react";
import { useTheme } from "next-themes";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ShoppingBasket01Icon,
  Search01Icon,
  RefreshIcon,
  Sun01Icon,
  Moon02Icon,
  Copy01Icon,
  Tick02Icon,
  ArrowUpRight01Icon,
  ArrowDown01Icon,
  Bookmark02Icon,
  DeliveryTruck01Icon,
  Discount01Icon,
  Cancel01Icon,
  InformationCircleIcon,
  SparklesIcon,
  Location01Icon,
  Wallet01Icon,
  GiftIcon,
  CheckmarkCircle02Icon,
} from "@hugeicons/core-free-icons";
import {
  expiryLabel,
  filterOffers,
  isLive,
  type Filter,
  type Offer,
  type OffersResponse,
} from "@/lib/offers";
import { stores, type Store } from "@/lib/stores";

type Design = "wallet" | "rewards" | "orbit";
type IconType = typeof Search01Icon;
const designs = [
  { id: "wallet", name: "Wallet", description: "Your stores, neatly stacked", icon: Wallet01Icon },
  { id: "rewards", name: "Rewards", description: "A brighter way to save", icon: GiftIcon },
  { id: "orbit", name: "Orbit", description: "A fresh perspective on offers", icon: SparklesIcon },
] as const;

function Icon({
  icon,
  size = 20,
  ...props
}: {
  icon: IconType;
  size?: number;
  className?: string;
}) {
  return <HugeiconsIcon icon={icon} size={size} strokeWidth={1.7} aria-hidden="true" {...props} />;
}

function StoreMark({ store, large = false }: { store: Store; large?: boolean }) {
  return (
    <span className={`store-mark mark-${store.id}${large ? " large" : ""}`} aria-hidden="true">
      {store.id === "checkers" ? (
        <>
          <span className="checkers-name">Checkers</span>
          <b>Sixty60</b>
        </>
      ) : store.id === "pnp" ? (
        <>
          <b>Pick n Pay</b>
          <span>asap!</span>
        </>
      ) : store.id === "woolworths" ? (
        <b>W.</b>
      ) : store.id === "shoprite" ? (
        <b>SHOPRITE</b>
      ) : store.id === "spar" ? (
        <b>
          SPAR<span>2U</span>
        </b>
      ) : (
        <b>makro</b>
      )}
    </span>
  );
}

function Count({ value }: { value: number }) {
  const [count, setCount] = useState(value);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    const control = animate(0, value, {
      duration: 0.9,
      ease: [0.2, 0.9, 0.25, 1],
      onUpdate: (latest) => setCount(Math.round(latest)),
    });
    return () => control.stop();
  }, [value, reduced]);
  return <span>{String(reduced ? value : count).padStart(2, "0")}</span>;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const field = document.createElement("textarea");
    field.value = text;
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    const success = document.execCommand("copy");
    field.remove();
    if (!success) throw new Error("Copy failed");
  }
}

function OfferRow({
  offer,
  saved,
  onSave,
  onToast,
  onReport,
  isNew,
  now,
}: {
  offer: Offer;
  saved: boolean;
  onSave: () => void;
  onToast: (message: string) => void;
  onReport: () => void;
  isNew: boolean;
  now: number;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    if (!offer.code) return;
    try {
      await copyText(offer.code);
      setCopied(true);
      onToast(`${offer.code} copied. Happy shopping!`);
      navigator.vibrate?.(15);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      onToast("Copy wasn't available. Select the code to copy it manually.");
    }
  };
  const urgent = offer.expiresAt && Date.parse(offer.expiresAt) - now < 86400000;
  return (
    <div className="offer-row">
      <div className="offer-top">
        <span className="offer-type">
          <Icon
            icon={offer.type === "free_delivery" ? DeliveryTruck01Icon : Discount01Icon}
            size={15}
          />
          {offer.type === "free_delivery" ? "Free delivery" : "Discount"}
        </span>
        {isNew && <span className="new-tag">New</span>}
        <button
          className={`save-offer ${saved ? "is-saved" : ""}`}
          onClick={onSave}
          aria-pressed={saved}
          aria-label={`${saved ? "Unsave" : "Save"} promotion: ${offer.title}`}
        >
          <Icon icon={Bookmark02Icon} size={19} />
        </button>
      </div>
      <h3>{offer.title}</h3>
      <p className="offer-criteria">{offer.criteria}</p>
      <div className="offer-meta">
        <span className={urgent ? "urgent" : ""}>
          {urgent && <i className="status-dot" />}
          {expiryLabel(offer, new Date(now))}
        </span>
        <a
          href={offer.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`View ${offer.sourceName} source for ${offer.title}`}
        >
          Source <Icon icon={ArrowUpRight01Icon} size={14} />
        </a>
      </div>
      {offer.code ? (
        <button
          className={`copy-code ${copied ? "copied" : ""}`}
          onClick={copy}
          aria-label={`Copy code ${offer.code}`}
        >
          <code>{offer.code}</code>
          <span>
            <Icon icon={copied ? Tick02Icon : Copy01Icon} size={17} />
            {copied ? "Copied" : "Copy code"}
          </span>
        </button>
      ) : (
        <div className="no-code">
          <Icon icon={CheckmarkCircle02Icon} size={20} />
          <div>
            <b>No code needed</b>
            <span>Apply the benefit in the app or at checkout</span>
          </div>
        </div>
      )}
      <details className="offer-details">
        <summary>
          Details & terms
          <Icon icon={ArrowDown01Icon} size={14} />
        </summary>
        <div>
          <p>
            <b>Found on:</b> {offer.sourceName}
          </p>
          <p>
            <b>Last reviewed:</b>{" "}
            {new Date(offer.checkedAt).toLocaleString("en-ZA", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Africa/Johannesburg",
            })}{" "}
            SAST
          </p>
          <p>
            {offer.verified
              ? "Tested at checkout."
              : "Source listed · not tested at checkout. Confirm eligibility before ordering."}
          </p>
          <button className="report-link" onClick={onReport}>
            Report not working
          </button>
        </div>
      </details>
    </div>
  );
}

function StoreCard({
  store,
  offers,
  open,
  design,
  onToggle,
  saved,
  onSave,
  onToast,
  onReport,
  newIds,
  checked,
  now,
}: {
  store: Store;
  offers: Offer[];
  open: boolean;
  design: Design;
  onToggle: () => void;
  saved: string[];
  onSave: (id: string) => void;
  onToast: (message: string) => void;
  onReport: (offer: Offer) => void;
  newIds: string[];
  checked?: string;
  now: number;
}) {
  const hasOffers = offers.length > 0;
  const alwaysOpen = design !== "wallet";
  const expanded = open || alwaysOpen;
  const style = {
    "--brand": store.color,
    "--brand-secondary": store.secondary,
    "--ink": store.ink,
  } as CSSProperties;
  return (
    <motion.article
      layout="position"
      className={`store-card ${expanded ? "expanded" : ""} ${hasOffers ? "has-offers" : "no-offers"}`}
      style={style}
      transition={{ duration: 0.5, ease: [0.2, 0.9, 0.25, 1] }}
    >
      <button
        className="store-card-header"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`offers-${store.id}`}
        aria-label={`${store.name}, ${offers.length} ${offers.length === 1 ? "offer" : "offers"} today${design === "wallet" ? ", expand promotions" : ""}`}
      >
        <StoreMark store={store} />
        <span className="store-card-info">
          <strong>{store.name}</strong>
          <span>
            {hasOffers
              ? `${offers.length} ${offers.length === 1 ? "offer" : "offers"} today`
              : "No confirmed offers"}
            <i />
            {store.loyalty}
          </span>
        </span>
        <span className="offer-count">{offers.length}</span>
        {design === "wallet" && <Icon icon={ArrowDown01Icon} size={18} className="card-chevron" />}
      </button>
      <div className="store-card-bottomline">
        <span>
          <i className={`tiny-dot ${hasOffers ? "active" : ""}`} />
          {hasOffers
            ? "A little saving, waiting for you"
            : checked === "unavailable"
              ? "Source couldn't be checked"
              : "We'll keep looking"}
        </span>
        <span>{hasOffers ? "VIEW OFFERS" : "ON OUR RADAR"}</span>
      </div>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            id={`offers-${store.id}`}
            key="offers"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.2, 0.9, 0.25, 1] }}
            className="offers-expand"
          >
            <div className="offers-inner">
              {offers.length ? (
                offers.map((offer) => (
                  <OfferRow
                    key={offer.id}
                    offer={offer}
                    saved={saved.includes(offer.id)}
                    onSave={() => onSave(offer.id)}
                    onToast={onToast}
                    onReport={() => onReport(offer)}
                    isNew={newIds.includes(offer.id)}
                    now={now}
                  />
                ))
              ) : (
                <div className="store-empty">
                  <Icon icon={Search01Icon} size={27} />
                  <h3>Nothing confirmed just yet.</h3>
                  <p>Refresh to check public promotions, or see what’s available in your store.</p>
                  <a href={store.url} target="_blank" rel="noopener noreferrer">
                    Visit {store.shortName}
                    <Icon icon={ArrowUpRight01Icon} size={16} />
                  </a>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

function SavingsIllustration() {
  return (
    <svg viewBox="0 0 300 270" className="savings-illustration" fill="none" aria-hidden="true">
      <ellipse cx="152" cy="233" rx="103" ry="12" fill="currentColor" opacity=".07" />
      <g transform="rotate(-9 150 145)">
        <rect x="48" y="70" width="207" height="134" rx="23" fill="#164da1" />
        <rect x="39" y="97" width="221" height="141" rx="23" fill="#00a79d" />
        <path d="M41 125h218" stroke="#fff" opacity=".15" />
        <text
          x="57"
          y="145"
          fill="white"
          fontSize="20"
          fontFamily="Jakarta, sans-serif"
          fontWeight="800"
        >
          Good things.
        </text>
        <text
          x="57"
          y="169"
          fill="white"
          fontSize="20"
          fontFamily="Jakarta, sans-serif"
          fontWeight="800"
        >
          Smaller totals.
        </text>
        <path
          d="M61 202h43m10 0h13"
          stroke="white"
          opacity=".7"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <circle cx="230" cy="210" r="14" fill="white" fillOpacity=".18" />
        <path d="m223 210 5 5 9-9" stroke="white" strokeWidth="2" strokeLinecap="round" />
      </g>
      <g transform="rotate(12 204 58)">
        <rect x="155" y="17" width="110" height="75" rx="16" fill="#c4f4ca" />
        <text
          x="174"
          y="64"
          fill="#183e2a"
          fontSize="26"
          fontFamily="Jakarta,sans-serif"
          fontWeight="800"
        >
          SAVE
        </text>
      </g>
      <path d="m34 55 4 12 13 4-13 4-4 13-4-13-13-4 13-4z" fill="#c4f4ca" />
      <path d="m266 127 3 8 9 3-9 3-3 9-3-9-8-3 8-3z" fill="#c4f4ca" />
    </svg>
  );
}

export function GroceryApp({
  initialData,
  initialNow,
}: {
  initialData: OffersResponse;
  initialNow: number;
}) {
  const [data, setData] = useState(initialData);
  const [design, setDesign] = useState<Design>("wallet");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [openStore, setOpenStore] = useState<string>(initialData.offers[0]?.storeId ?? "checkers");
  const [saved, setSaved] = useState<string[]>([]);
  const [savedOnly, setSavedOnly] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState("");
  const [toast, setToast] = useState("");
  const [infoOpen, setInfoOpen] = useState(false);
  const [report, setReport] = useState<Offer | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(initialNow);
  const [pull, setPull] = useState(0);
  const touchStart = useRef<number | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const refreshController = useRef<AbortController | null>(null);
  const modalRef = useRef<HTMLDialogElement>(null);
  const { resolvedTheme, setTheme } = useTheme();
  const reduced = useReducedMotion();

  const showToast = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3500);
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setMounted(true);
      const selected = new URLSearchParams(window.location.search).get("design");
      try {
        const preference = selected ?? localStorage.getItem("grocery-design");
        if (designs.some((item) => item.id === preference)) setDesign(preference as Design);
        const stored: unknown = JSON.parse(localStorage.getItem("grocery-saved") ?? "[]");
        if (Array.isArray(stored))
          setSaved(stored.filter((id): id is string => typeof id === "string"));
      } catch {
        /* Storage is optional in private browsing. */
      }
    });
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(timer);
      clearTimeout(toastTimer.current);
      refreshController.current?.abort();
    };
  }, []);
  useEffect(() => {
    const dialog = modalRef.current;
    if (infoOpen || report) dialog?.showModal();
    else dialog?.close();
  }, [infoOpen, report]);

  const chooseDesign = (value: Design) => {
    setDesign(value);
    if (value === "rewards") setTheme("light");
    try {
      localStorage.setItem("grocery-design", value);
    } catch {
      /* Optional preference. */
    }
    const url = new URL(window.location.href);
    url.searchParams.set("design", value);
    window.history.replaceState({}, "", url);
  };
  const saveOffer = (id: string) => {
    const next = saved.includes(id) ? saved.filter((item) => item !== id) : [...saved, id];
    setSaved(next);
    try {
      localStorage.setItem("grocery-saved", JSON.stringify(next));
    } catch {
      showToast("Saved for this visit. Browser storage is unavailable.");
      return;
    }
    showToast(
      next.includes(id) ? "Saved for your next grocery run." : "Removed from your saved offers.",
    );
  };
  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setStatus("Checking public promotion pages…");
    const controller = new AbortController();
    refreshController.current = controller;
    const timeout = setTimeout(() => controller.abort(), 115_000);
    try {
      const response = await fetch("/api/refresh", { method: "POST", signal: controller.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "We couldn't refresh right now.");
      const next = result as OffersResponse;
      setData(next);
      setNow(Date.now());
      const unavailable = next.checks.filter((check) => check.status === "unavailable").length;
      const partial = next.checks.some((check) => check.message);
      const found = next.newOfferIds.length;
      setStatus(
        `${found ? `${found} new ${found === 1 ? "offer" : "offers"} found.` : "Search complete. No new confirmed offers."}${unavailable ? ` ${unavailable} ${unavailable === 1 ? "store was" : "stores were"} unavailable.` : partial ? " Some pages were unavailable." : ""}`,
      );
      showToast(
        found
          ? `${found} new ${found === 1 ? "saving" : "savings"} to explore.`
          : partial
            ? "Checked available pages. Some sources couldn't be reached."
            : "You're up to date with the sources we could check.",
      );
    } catch (error) {
      const message = controller.signal.aborted
        ? "The search took too long. Try again in a moment."
        : error instanceof Error
          ? error.message
          : "We couldn't refresh right now.";
      setStatus(message);
      showToast(message);
    } finally {
      clearTimeout(timeout);
      setRefreshing(false);
      refreshController.current = null;
    }
  };
  const sendReport = async (reason: string) => {
    if (!report || reportBusy) return;
    setReportBusy(true);
    try {
      const response = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId: report.id, reason }),
      });
      if (!response.ok) throw new Error("Your report couldn't be saved. Please try again.");
      setReport(null);
      showToast("Thanks. Your report was saved for review.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Couldn't save the report.");
    } finally {
      setReportBusy(false);
    }
  };

  const live = data.offers.filter((offer) => isLive(offer, now));
  const allVisible = filterOffers(live, filter, query, now).filter(
    (offer) => !savedOnly || saved.includes(offer.id),
  );
  const activeStores = stores.filter((store) => live.some((offer) => offer.storeId === store.id));
  const visibleStores = stores
    .filter(
      (store) =>
        `${store.name} ${store.loyalty}`.toLowerCase().includes(query.trim().toLowerCase()) &&
        (!savedOnly || allVisible.some((offer) => offer.storeId === store.id)),
    )
    .map((store) => ({ store, offers: allVisible.filter((offer) => offer.storeId === store.id) }))
    .sort((a, b) => Number(b.offers.length > 0) - Number(a.offers.length > 0));
  const selectedStore = stores.find((store) => store.id === openStore) ?? stores[0];
  const glowStyle = {
    "--glow-one": selectedStore.color,
    "--glow-two": selectedStore.secondary,
  } as CSSProperties;
  const date = new Date(now).toLocaleDateString("en-ZA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Africa/Johannesburg",
  });
  const initialStatus = data.updatedAt
    ? `Last search ${new Date(data.updatedAt).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Johannesburg" })} SAST · ${data.mode === "web_search" ? "Web search & public sources" : "Public promotion pages"}`
    : "Source-backed listings · refresh to check for something new";

  return (
    <div
      className={`app design-${design}`}
      data-ready={mounted}
      style={glowStyle}
      onTouchStart={(event) => {
        if (window.scrollY <= 0 && !(event.target as HTMLElement).closest("button,input,a,dialog"))
          touchStart.current = event.touches[0].clientY;
      }}
      onTouchMove={(event) => {
        if (touchStart.current !== null)
          setPull(Math.min(130, Math.max(0, event.touches[0].clientY - touchStart.current)));
      }}
      onTouchEnd={() => {
        if (pull > 100) void refresh();
        touchStart.current = null;
        setPull(0);
      }}
    >
      <a className="skip-link" href="#offers">
        Skip to offers
      </a>
      <div className="ambient-glow" aria-hidden="true" />
      <header className="site-header shell">
        <a className="brand" href="/" aria-label="Grocery codes home">
          <span className="brand-icon">
            <Icon icon={ShoppingBasket01Icon} size={25} />
          </span>
          <span>
            grocery<span className="brand-light">codes</span>
            <i />
          </span>
        </a>
        <nav className="header-nav" aria-label="Main navigation">
          <button className={!savedOnly ? "current" : ""} onClick={() => setSavedOnly(false)}>
            Today's offers
          </button>
          <button className={savedOnly ? "current" : ""} onClick={() => setSavedOnly(true)}>
            Saved
            <span className="nav-count">
              {saved.filter((id) => live.some((offer) => offer.id === id)).length}
            </span>
          </button>
          <button onClick={() => setInfoOpen(true)}>How it works</button>
        </nav>
        <div className="header-actions">
          <span className="country">
            <Icon icon={Location01Icon} size={14} />
            SOUTH AFRICA
          </span>
          <button
            className="icon-button theme-button"
            aria-label={`Switch to ${mounted && resolvedTheme === "light" ? "dark" : "light"} theme`}
            onClick={() => setTheme(resolvedTheme === "light" ? "dark" : "light")}
          >
            <Icon icon={mounted && resolvedTheme === "light" ? Moon02Icon : Sun01Icon} size={20} />
          </button>
          <button
            className={`icon-button header-refresh ${refreshing ? "refreshing" : ""}`}
            onClick={() => void refresh()}
            disabled={refreshing}
            aria-label="Refresh promotions"
          >
            <Icon icon={RefreshIcon} size={20} />
          </button>
        </div>
      </header>
      {refreshing && (
        <>
          <progress className="sr-only" aria-label="Checking promotion sources" />
          <div className="refresh-progress" aria-hidden="true">
            <span />
          </div>
        </>
      )}
      {pull > 35 && (
        <div className="pull-cue">
          <Icon icon={RefreshIcon} size={18} />
          {pull > 100 ? "Release to refresh" : "Pull to find fresh offers"}
        </div>
      )}
      <main className="shell">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <span className="eyebrow">
              <i className="status-dot" />
              YOUR DAILY DOSE OF SAVINGS
            </span>
            <h1 id="hero-title">
              A little less
              <br />
              at <em>checkout.</em>
            </h1>
            <p>
              Good groceries. Better prices.
              <br className="mobile-break" /> All your stores, in one place.
            </p>
            <div className="hero-date">
              <span>{date}</span>
              <span className="date-divider" />
              <span>
                Made for Mzansi<span className="tiny-star">✳</span>
              </span>
            </div>
          </div>
          <div className="hero-visual">
            <div className="hero-live">
              <span className="live-pill">
                <i className="status-dot" />
                TODAY'S FINDS
              </span>
              <div className="live-number">
                <Count value={live.length} />
                <span className="number-star">✳</span>
              </div>
              <p>
                live {live.length === 1 ? "offer" : "offers"} across{" "}
                <strong>{activeStores.length} stores</strong>
              </p>
              <div className="store-avatars">
                {stores.map((store) => (
                  <button
                    key={store.id}
                    title={`${store.name}: ${live.filter((offer) => offer.storeId === store.id).length} offers`}
                    aria-label={`Search ${store.name}`}
                    onClick={() => {
                      setQuery(store.name);
                      setSavedOnly(false);
                      document.getElementById("offers")?.scrollIntoView({
                        behavior: reduced ? "instant" : "smooth",
                        block: "start",
                      });
                    }}
                    className={
                      !activeStores.some((active) => active.id === store.id) ? "inactive" : ""
                    }
                    style={{ background: store.color, color: store.ink }}
                  >
                    <span>{store.monogram}</span>
                  </button>
                ))}
              </div>
              <span className="hero-note">A small saving goes a long way.</span>
            </div>
            <div className="hero-art">
              <SavingsIllustration />
            </div>
          </div>
        </section>
        <section id="offers" className="offers-section" aria-label="Today's store promotions">
          <div className="section-heading">
            <div>
              <h2>{savedOnly ? "Your saved offers" : "Your stores. Your savings."}</h2>
              <p>
                {savedOnly
                  ? "A little collection for your next grocery run."
                  : "See who's got a little something for you today."}
              </p>
            </div>
            <button
              className="mobile-saved icon-button"
              aria-label={savedOnly ? "Show all offers" : "Show saved offers"}
              aria-pressed={savedOnly}
              onClick={() => setSavedOnly(!savedOnly)}
            >
              <Icon icon={Bookmark02Icon} size={19} />
            </button>
            <button
              className={`refresh-button ${refreshing ? "refreshing" : ""}`}
              onClick={() => void refresh()}
              disabled={refreshing}
            >
              <Icon icon={RefreshIcon} size={18} />
              <span>{refreshing ? "Checking sources…" : "Find fresh offers"}</span>
            </button>
          </div>
          <div className="toolbar">
            <div className="search-field">
              <Icon icon={Search01Icon} size={20} />
              <input
                type="search"
                disabled={!mounted}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search your grocery store"
                aria-label="Search stores"
                autoComplete="off"
              />
              {query && (
                <button
                  className="clear-search"
                  aria-label="Clear search"
                  onClick={() => setQuery("")}
                >
                  <Icon icon={Cancel01Icon} size={16} />
                </button>
              )}
              <span className="search-shortcut">6 stores</span>
            </div>
            <fieldset className="filters" aria-label="Promotion type">
              {(
                [
                  { id: "all", label: "All offers", icon: SparklesIcon },
                  { id: "free_delivery", label: "Free delivery", icon: DeliveryTruck01Icon },
                  { id: "discount", label: "Discounts", icon: Discount01Icon },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  aria-label={item.label}
                  aria-pressed={filter === item.id}
                  className={filter === item.id ? "active" : ""}
                  onClick={() => setFilter(item.id)}
                >
                  <Icon icon={item.icon} size={17} />
                  {item.label}
                  {filter === item.id && <span>{allVisible.length}</span>}
                </button>
              ))}
            </fieldset>
          </div>
          <div className="results-status">
            <output className="status-text" aria-live="polite">
              <i className={`tiny-dot ${refreshing ? "searching" : "active"}`} />
              {status || initialStatus}
            </output>
            <span className="view-name">
              {designs.find((item) => item.id === design)?.description}
            </span>
          </div>
          <div className="content-grid">
            <div className="stores-area">
              {visibleStores.length && (!savedOnly || allVisible.length) ? (
                <div className="store-list">
                  {visibleStores.map(({ store, offers }) => (
                    <StoreCard
                      key={store.id}
                      store={store}
                      offers={offers}
                      open={openStore === store.id}
                      design={design}
                      onToggle={() =>
                        setOpenStore(openStore === store.id && design === "wallet" ? "" : store.id)
                      }
                      saved={saved}
                      onSave={saveOffer}
                      onToast={showToast}
                      onReport={setReport}
                      newIds={data.newOfferIds}
                      checked={data.checks.find((check) => check.storeId === store.id)?.status}
                      now={now}
                    />
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <span>
                    <Icon icon={savedOnly ? Bookmark02Icon : Search01Icon} size={35} />
                  </span>
                  <h3>
                    {savedOnly ? "Keep a little saving for later." : "No stores by that name."}
                  </h3>
                  <p>
                    {savedOnly
                      ? "Tap the bookmark on a promotion to save it here."
                      : "Try Checkers, Pick n Pay or another favourite."}
                  </p>
                  <button
                    className="primary-button"
                    onClick={() => {
                      setQuery("");
                      setSavedOnly(false);
                      setFilter("all");
                    }}
                  >
                    Explore all stores
                    <Icon icon={ArrowUpRight01Icon} size={18} />
                  </button>
                </div>
              )}
              {!allVisible.length && visibleStores.length > 0 && !savedOnly && (
                <p className="filter-empty">
                  No confirmed{" "}
                  {filter === "free_delivery"
                    ? "free delivery offers"
                    : filter === "discount"
                      ? "discounts"
                      : "offers"}{" "}
                  match right now. Try another filter or refresh the sources.
                </p>
              )}
            </div>
            <aside className="savings-sidebar">
              <div className="small-note">
                <span className="eyebrow">THE SMALL PRINT, MADE SIMPLE</span>
                <h3>
                  A good deal starts
                  <br />
                  with the details.
                </h3>
                <p>
                  Check the minimum basket, membership and expiry before you shop. Some benefits
                  apply automatically.
                </p>
                <div className="note-rule" />
                <div className="note-tip">
                  <span>01</span>
                  <div>
                    <b>Find your store</b>
                    <p>Colour means there’s an offer to explore.</p>
                  </div>
                </div>
                <div className="note-tip">
                  <span>02</span>
                  <div>
                    <b>Read the little details</b>
                    <p>Know exactly what qualifies.</p>
                  </div>
                </div>
                <div className="note-tip">
                  <span>03</span>
                  <div>
                    <b>Copy. Shop. Save.</b>
                    <p>A code, when you need one. One tap.</p>
                  </div>
                </div>
                <button onClick={() => setInfoOpen(true)}>
                  How we find offers
                  <Icon icon={ArrowUpRight01Icon} size={17} />
                </button>
              </div>
              <div className="sidebar-art">
                <SavingsIllustration />
                <span>
                  Less searching.
                  <br />
                  <em>More saving.</em>
                </span>
              </div>
              <p className="source-note">
                <Icon icon={InformationCircleIcon} size={17} />
                Listings come from public sources. Availability and checkout eligibility can change.
              </p>
            </aside>
          </div>
        </section>
        <footer className="site-footer">
          <a className="footer-brand" href="/">
            grocerycodes<span>✳</span>
          </a>
          <p>A little less at checkout. A little more for you.</p>
          <button onClick={() => setInfoOpen(true)}>
            Independent. Made for South Africa.
            <Icon icon={ArrowUpRight01Icon} size={14} />
          </button>
        </footer>
      </main>
      <nav className="design-switcher" aria-label="Choose a design option">
        <span className="design-label">PICK YOUR VIEW</span>
        {designs.map((item) => (
          <button
            key={item.id}
            aria-pressed={design === item.id}
            className={design === item.id ? "active" : ""}
            onClick={() => chooseDesign(item.id)}
          >
            <Icon icon={item.icon} size={18} />
            <span>{item.name}</span>
            {design === item.id && (
              <motion.i
                layoutId="selected-design"
                className="selected-design"
                transition={{ type: "spring", stiffness: 350, damping: 30 }}
              />
            )}
          </button>
        ))}
      </nav>
      <AnimatePresence>
        {toast && (
          <motion.output
            key="toast"
            className="toast"
            aria-live="polite"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
          >
            <Icon icon={Tick02Icon} size={20} />
            <span>{toast}</span>
            <button aria-label="Dismiss notification" onClick={() => setToast("")}>
              <Icon icon={Cancel01Icon} size={16} />
            </button>
          </motion.output>
        )}
      </AnimatePresence>
      <dialog
        ref={modalRef}
        className="info-dialog"
        onCancel={() => {
          setInfoOpen(false);
          setReport(null);
        }}
      >
        <div className="dialog-content">
          <button
            className="icon-button close-dialog"
            aria-label="Close dialog"
            onClick={() => {
              setInfoOpen(false);
              setReport(null);
            }}
          >
            <Icon icon={Cancel01Icon} />
          </button>
          <span className="dialog-icon">
            <Icon icon={report ? InformationCircleIcon : ShoppingBasket01Icon} size={30} />
          </span>
          <span className="eyebrow">
            {report ? "HELP KEEP OFFERS USEFUL" : "A LITTLE LESS SEARCHING"}
          </span>
          <h2>{report ? "Something not quite right?" : "Find a saving. Know the details."}</h2>
          {report ? (
            <>
              <p>{report.title}</p>
              <p>What happened? Your report helps us review the listing.</p>
              <div className="report-reasons">
                {["The code didn't work", "The offer has ended", "The terms are different"].map(
                  (reason) => (
                    <button
                      key={reason}
                      disabled={reportBusy}
                      onClick={() => void sendReport(reason)}
                    >
                      {reason}
                      <Icon icon={ArrowUpRight01Icon} size={18} />
                    </button>
                  ),
                )}
              </div>
            </>
          ) : (
            <>
              <p>
                We bring public promotions from South Africa's grocery stores together so you can
                compare the details before you shop.
              </p>
              <ol>
                <li>
                  <b>Browse your stores.</b> Filter by free delivery or discounts. Stores with an
                  offer appear first.
                </li>
                <li>
                  <b>Check the terms.</b> Memberships, minimum baskets and customer restrictions are
                  shown with each offer.
                </li>
                <li>
                  <b>Copy or redeem.</b> Copy a code in one tap. For a no-code benefit, follow the
                  instructions at checkout.
                </li>
              </ol>
              <div className="dialog-source">
                <Icon icon={InformationCircleIcon} size={20} />
                <p>
                  Refresh checks accessible public promotion pages. A source listing does not mean a
                  code has been tested. We exclude expired and unconfirmed-expiry offers, and link
                  every promotion to its source. Some retailer sites may be unavailable to automated
                  checks.
                </p>
              </div>
              <p className="independence">
                Independent service. No affiliation with the featured retailers. Saved offers stay
                in this browser.
              </p>
            </>
          )}
        </div>
      </dialog>
    </div>
  );
}
