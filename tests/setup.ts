import { vi } from "vitest";

// These Node tests exercise server modules without Next.js's bundler boundary.
vi.mock("server-only", () => ({}));
