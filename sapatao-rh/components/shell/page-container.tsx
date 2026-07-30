import type { ReactNode } from "react";

/**
 * Standard page wrapper that adds the padding and overflow-auto scroll
 * expected by non-chat pages. The layout's <main> has overflow-hidden so that
 * the chat page can fill 100% height; all other pages use this wrapper.
 *
 * `max-w-page` (88rem) centraliza o conteúdo — sem isso, tabelas esticam de
 * ponta a ponta em telas largas.
 */
export function PageContainer({ children }: { children: ReactNode }) {
  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto w-full max-w-page p-6 lg:p-8">{children}</div>
    </div>
  );
}
