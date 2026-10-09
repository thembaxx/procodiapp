"use client";

import { useState } from "react";
import {
  SmartPhone01Icon,
  Download04Icon,
  Tick02Icon,
  Share01Icon,
  PlusSignIcon,
  RefreshIcon,
  WifiOff01Icon,
} from "@hugeicons/core-free-icons";
import { Icon } from "@/components/icon";
import { usePwa } from "@/components/pwa-provider";

export function PwaControls() {
  const pwa = usePwa();
  const [instructions, setInstructions] = useState(false);
  return (
    <section className="pwa-settings" aria-labelledby="pwa-title">
      <div className="pwa-setting-heading">
        <span className="pwa-app-icon">
          <Icon icon={SmartPhone01Icon} size={23} />
        </span>
        <div>
          <h3 id="pwa-title">Savings, on your home screen.</h3>
          <p>Your stores. One tap away.</p>
        </div>
      </div>
      {pwa.installed ? (
        <p className="pwa-installed">
          <Icon icon={Tick02Icon} size={16} /> Installed on this device
        </p>
      ) : (
        <button
          className="pwa-install-button"
          disabled={pwa.installing}
          aria-expanded={instructions}
          aria-controls="install-help"
          onClick={async () => {
            if (pwa.canInstall) {
              if (!(await pwa.install())) setInstructions(true);
            } else setInstructions((value) => !value);
          }}
        >
          <Icon icon={Download04Icon} size={19} />
          {pwa.installing
            ? "Opening install…"
            : pwa.canInstall
              ? "Install app"
              : pwa.ios
                ? "Add to Home Screen"
                : "How to install"}
        </button>
      )}
      <div id="install-help" className="install-help" hidden={!instructions}>
        {pwa.ios ? (
          <ol>
            <li>
              <Icon icon={Share01Icon} size={17} />
              <span>
                Open your browser's <strong>Share</strong> menu.
              </span>
            </li>
            <li>
              <Icon icon={PlusSignIcon} size={17} />
              <span>
                Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
              </span>
            </li>
          </ol>
        ) : (
          <p>
            Open your browser menu and choose <strong>Install app</strong> or{" "}
            <strong>Add to Home Screen</strong>. If the option is unavailable, open this page in
            Chrome or Safari.
          </p>
        )}
      </div>
      <output className="offline-readiness">
        <Icon icon={pwa.offlineReady ? Tick02Icon : WifiOff01Icon} size={15} />
        {pwa.offlineReady
          ? "Ready offline · offers saved on this device"
          : pwa.workerState === "failed" || pwa.workerState === "unavailable"
            ? "Offline access isn't available yet on this browser."
            : pwa.snapshotReady === false
              ? pwa.online
                ? "Offers couldn't be saved for offline use."
                : "Connect once to save offers for offline use."
              : "Preparing your offline access…"}
      </output>
      {pwa.updateReady && (
        <button
          className="pwa-update-button"
          disabled={pwa.updating || !pwa.online}
          onClick={pwa.update}
        >
          <Icon icon={RefreshIcon} size={17} />{" "}
          {pwa.updating ? "Updating…" : "Update available · reload app"}
        </button>
      )}
    </section>
  );
}

export function AppUpdateNotice() {
  const { updateReady, updating, update, online } = usePwa();
  const [later, setLater] = useState(false);
  if (!updateReady || later) return null;
  return (
    <aside className="app-update-notice shell" aria-label="App update" aria-live="polite">
      <span>
        <Icon icon={RefreshIcon} size={19} />
        <span>
          A fresh app is ready.<small>Your saved offers stay with you.</small>
        </span>
      </span>
      <button onClick={update} disabled={updating || !online}>
        {updating ? "Updating…" : "Update now"}
      </button>
      <button className="update-later" onClick={() => setLater(true)}>
        Later
      </button>
    </aside>
  );
}
