import { MetricCardSkeleton } from "@/components/dashboard/metric-card";
import { Skeleton } from "@/components/ui/misc";

/** Shown while a dashboard route is loading. Mirrors the Overview structure so nothing jumps when content arrives. */
export default function DashboardLoading() {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div className="mb-10 space-y-3">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <MetricCardSkeleton key={i} />
        ))}
      </div>
      <div className="mt-8 grid gap-6 xl:grid-cols-12">
        <Skeleton className="h-96 rounded-card xl:col-span-7" />
        <Skeleton className="h-96 rounded-card xl:col-span-5" />
      </div>
    </div>
  );
}
