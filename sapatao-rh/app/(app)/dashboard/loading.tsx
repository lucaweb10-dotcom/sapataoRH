import { PageContainer } from "@/components/shell/page-container";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageContainer>
      <div className="mb-6 space-y-2">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-40" />
      </div>

      <div className="space-y-8">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-xs">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-14" />
              <Skeleton className="h-3 w-28" />
            </div>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, col) => (
            <div key={col} className="space-y-3">
              <Skeleton className="h-5 w-52" />
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-xs"
                >
                  <Skeleton className="size-9 shrink-0 rounded-lg" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-2/5" />
                    <Skeleton className="h-3 w-3/5" />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
