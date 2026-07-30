"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createCoalescer, REFRESH_COALESCE_MS, type Coalescer } from "./coalesce";

/**
 * `router.refresh()` colapsado: no máximo 1 refetch RSC a cada `waitMs`,
 * com o primeiro evento passando direto. Use em todo listener de realtime.
 */
export function useThrottledRefresh(waitMs: number = REFRESH_COALESCE_MS): () => void {
  const router = useRouter();
  // O router é lido no momento do disparo, não capturado na criação.
  const routerRef = useRef(router);
  routerRef.current = router;

  const coalescerRef = useRef<Coalescer | null>(null);
  if (coalescerRef.current === null) {
    coalescerRef.current = createCoalescer(() => routerRef.current.refresh(), waitMs);
  }

  useEffect(() => {
    const c = coalescerRef.current;
    return () => c?.cancel();
  }, []);

  return useCallback(() => coalescerRef.current?.schedule(), []);
}
