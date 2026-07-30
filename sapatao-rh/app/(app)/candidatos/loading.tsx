import { PageContainer } from "@/components/shell/page-container";
import { Skeleton, SkeletonTable } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageContainer>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-[28rem] max-w-full" />
        </div>
        <Skeleton className="h-9 w-40" />
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-10 w-full max-w-xs" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-32" />
        </div>
        <SkeletonTable rows={8} columns={6} />
      </div>
    </PageContainer>
  );
}
