import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const chromiumLaunchOptions = {
  launchOptions: {
    args: ["--enable-unsafe-swiftshader"],
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {}),
  },
};

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/setup.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    serviceWorkers: "block",
  },
  projects: [
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium", ...chromiumLaunchOptions },
    },
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 }, ...chromiumLaunchOptions } },
    {
      name: "firefox",
      testMatch: ["appearance.spec.ts", "settings.spec.ts", "pwa.spec.ts"],
      use: { browserName: "firefox", viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "webkit-mobile",
      testMatch: ["appearance.spec.ts", "settings.spec.ts", "pwa.spec.ts"],
      use: { ...devices["iPhone 13"], browserName: "webkit" },
    },
  ],
  webServer: {
    command: "pnpm start --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    env: {
      DATA_DIR: path.join(process.cwd(), ".data/e2e"),
      // Reserved test-only domain; never used by production or preview configuration.
      SITE_URL: "https://grocery.example",
      INDEXING_ENABLED: "true",
      CONTACT_EMAIL: "privacy@grocery.example",
      SEARCH_PROVIDER: "none",
      SUPABASE_URL: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      CRON_SECRET: "",
    },
    timeout: 120000,
  },
});
