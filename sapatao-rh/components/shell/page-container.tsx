import type { ReactNode } from "react";

/**
 * Standard page wrapper that adds the p-6 padding and overflow-auto scroll
 * expected by non-chat pages. The layout's <main> has overflow-hidden so that
 * the chat page can fill 100% height; all other pages use this wrapper.
 */
export function PageContainer({ children }: { children: ReactNode }) {
  return <div className="h-full overflow-auto p-6">{children}</div>;
}
