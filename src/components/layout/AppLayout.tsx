"use client";

import type { ReactNode } from "react";
import { Header } from "./Header";
import { Footer } from "./Footer";

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    // app-shell is at least as tall as the screen, so on a short page the footer sits at the bottom, not in the middle.
    <div className="app-shell">
      <Header />
      <div className="app-content">{children}</div>
      <Footer />
    </div>
  );
}
