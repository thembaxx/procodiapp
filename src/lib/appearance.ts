export type Design = "wallet" | "rewards" | "orbit";

const backgrounds = {
  dark: "#0b0e11",
  light: "#f5f7f3",
  orbitLight: "#f4f0fa",
} as const;

export function appearanceBackground(theme: string | null, design: string | null) {
  if (theme !== "light") return backgrounds.dark;
  return design === "orbit" ? backgrounds.orbitLight : backgrounds.light;
}

// The document canvas is available before external styles or React have loaded.
export const appearanceCriticalCss = `
html { --bg: ${backgrounds.dark}; background: var(--bg); color-scheme: dark; }
html[data-theme="light"] { --bg: ${backgrounds.light}; color-scheme: light; }
html[data-theme="light"][data-design="orbit"] { --bg: ${backgrounds.orbitLight}; }
body { margin: 0; background: var(--bg); }
`;

// With JavaScript enabled the bootstrap owns these nodes, avoiding React re-adding
// server-default metadata during hydration after a saved preference changes it.
export const appearanceNoScript = `<meta name="theme-color" content="${backgrounds.dark}"><meta name="color-scheme" content="dark"><link rel="manifest" href="/manifest.webmanifest">`;

// Runs synchronously in the head. Only fixed, app-owned constants enter this script.
// Observing the root also covers next-themes' system-theme changes and loading/error states.
export const appearanceBootstrap = `(() => {
  const root = document.documentElement;
  const colors = ${JSON.stringify(backgrounds)};
  let theme = "dark";
  let savedDesign = "wallet";
  try {
    theme = localStorage.getItem("theme") || theme;
    savedDesign = localStorage.getItem("grocery-design") || savedDesign;
  } catch {}
  const selected = new URLSearchParams(location.search).get("design") || savedDesign;
  root.dataset.design = ["wallet", "rewards", "orbit"].includes(selected) ? selected : "wallet";
  root.dataset.theme = theme === "light" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches === false) ? "light" : "dark";
  const themeColor = document.createElement("meta");
  themeColor.name = "theme-color";
  const colorScheme = document.createElement("meta");
  colorScheme.name = "color-scheme";
  const manifest = document.createElement("link");
  manifest.rel = "manifest";
  document.head.append(themeColor, colorScheme, manifest);
  function sync() {
    const theme = root.dataset.theme === "light" ? "light" : "dark";
    const design = root.dataset.design || "wallet";
    const color = theme === "dark" ? colors.dark : design === "orbit" ? colors.orbitLight : colors.light;
    root.style.colorScheme = theme;
    themeColor.content = color;
    colorScheme.content = theme;
    manifest.href = "/manifest.webmanifest?theme=" + theme + "&design=" + design;
  }
  sync();
  new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ["data-theme", "data-design"] });
})();`;
