"use client";

import { ThemeProvider } from "next-themes";
import { MotionConfig } from "motion/react";
import { PwaProvider } from "@/components/pwa-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="dark" enableSystem>
      <MotionConfig reducedMotion="user">
        <PwaProvider>{children}</PwaProvider>
      </MotionConfig>
    </ThemeProvider>
  );
}
