import type { ReactNode } from "react";

import { EmptyIllustration } from "@/components/ui/Illustrations";

/** "Nothing here yet": a small picture, one line, and (optionally) what to do next. */
export function EmptyNote({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="en">
      <EmptyIllustration />
      <div className="en__title">{title}</div>
      {children && <div className="en__text">{children}</div>}
    </div>
  );
}
