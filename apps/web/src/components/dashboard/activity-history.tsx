"use client";

import * as React from "react";
import { SearchX } from "lucide-react";
import { ActivityItem } from "@/components/dashboard/activity-item";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { Pagination, paginate } from "@/components/ui/pagination";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ActionRequestStatus } from "@/lib/contracts";
import type { DashboardRequest } from "@/mocks/dashboard";

const PAGE_SIZE = 6;

type Filter = "all" | "attention" | "blocked" | "completed";

const GROUPS: Record<Exclude<Filter, "all">, readonly ActionRequestStatus[]> = {
  attention: ["pending_approval", "failed", "unknown", "expired"],
  blocked: ["denied"],
  completed: ["succeeded"],
};

/**
 * The activity history: newest first, one plain row per request, and four simple filters. Each row can be opened for the
 * precise record (authorization, approval and execution as separate facts). No search box and no table: the same list
 * reads well on a phone and on a wide screen.
 */
export function ActivityHistory({ requests }: { requests: readonly DashboardRequest[] }) {
  const [filter, setFilter] = React.useState<Filter>("all");
  const [page, setPage] = React.useState(1);

  const count = (f: Filter) =>
    f === "all" ? requests.length : requests.filter((r) => GROUPS[f].includes(r.status)).length;
  const filtered =
    filter === "all" ? requests : requests.filter((r) => GROUPS[filter].includes(r.status));
  const view = paginate(filtered, page, PAGE_SIZE);

  return (
    <Tabs
      value={filter}
      onValueChange={(v) => {
        setFilter(v as Filter);
        setPage(1);
      }}
    >
      <div className="max-w-full overflow-x-auto pb-1">
        <TabsList variant="segmented" aria-label="Show">
          <TabsTrigger value="all" className="group-data-[variant=segmented]/tabs:h-10">
            All ({count("all")})
          </TabsTrigger>
          <TabsTrigger value="attention" className="group-data-[variant=segmented]/tabs:h-10">
            Needs attention ({count("attention")})
          </TabsTrigger>
          <TabsTrigger value="blocked" className="group-data-[variant=segmented]/tabs:h-10">
            Blocked ({count("blocked")})
          </TabsTrigger>
          <TabsTrigger value="completed" className="group-data-[variant=segmented]/tabs:h-10">
            Completed ({count("completed")})
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value={filter} className="mt-5">
        {view.total === 0 ? (
          <EmptyState
            icon={<SearchX aria-hidden="true" />}
            title="Nothing to show here"
            description="No activity matches this view."
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setFilter("all");
                  setPage(1);
                }}
              >
                Show everything
              </Button>
            }
          />
        ) : (
          <>
            <div className="overflow-hidden rounded-card border border-border/60 bg-surface">
              <ul aria-label="Activity history (sample data)">
                {view.items.map((r) => (
                  <ActivityItem key={r.id} request={r} details headingLevel={2} />
                ))}
              </ul>
            </div>
            <div className="mt-6">
              <Pagination
                page={view.page}
                pageCount={view.pageCount}
                from={view.from}
                to={view.to}
                total={view.total}
                onPageChange={setPage}
                label="Activity pagination"
                noun="items"
              />
            </div>
          </>
        )}
      </TabsContent>
    </Tabs>
  );
}
