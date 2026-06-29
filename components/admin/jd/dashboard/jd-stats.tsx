import React from "react";
import { Card } from "@heroui/react";
import { Briefcase, PlayCircle, Clock, CheckCircle2, XCircle } from "lucide-react";
import { useJdDashboard } from "./context";

export function JdStats() {
  const { rows, loading } = useJdDashboard();

  const totalJobs = rows.length;
  const runningJobs = rows.filter((r) => r.status === "Hiring").length;
  const pendingJobs = rows.filter((r) => r.status === "Pending").length;
  const completedJobs = rows.filter((r) => r.status === "Done").length;
  const closedJobs = rows.filter((r) => r.status === "Closed").length;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5" aria-live="polite">
      <Card variant="secondary">
        <Card.Header className="flex flex-row items-center justify-between gap-2 pb-2">
          <Card.Description className="text-sm font-medium text-muted">
            Total jobs
          </Card.Description>
          <Briefcase className="size-4 text-muted" aria-hidden="true" />
        </Card.Header>
        <Card.Content className="pt-0">
          <span className="text-2xl font-bold tracking-tight tabular-nums">
            {loading ? (
              <>
                <span className="inline-block h-8 w-12 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
                <span className="sr-only">Loading…</span>
              </>
            ) : (
              totalJobs
            )}
          </span>
        </Card.Content>
      </Card>

      <Card variant="secondary">
        <Card.Header className="flex flex-row items-center justify-between gap-2 pb-2">
          <Card.Description className="text-sm font-medium text-muted">
            Active jobs
          </Card.Description>
          <PlayCircle className="size-4 text-success" aria-hidden="true" />
        </Card.Header>
        <Card.Content className="pt-0">
          <span className="text-2xl font-bold tracking-tight text-success tabular-nums">
            {loading ? (
              <>
                <span className="inline-block h-8 w-12 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
                <span className="sr-only">Loading…</span>
              </>
            ) : (
              runningJobs
            )}
          </span>
        </Card.Content>
      </Card>

      <Card variant="secondary">
        <Card.Header className="flex flex-row items-center justify-between gap-2 pb-2">
          <Card.Description className="text-sm font-medium text-muted">
            Pending jobs
          </Card.Description>
          <Clock className="size-4 text-warning" aria-hidden="true" />
        </Card.Header>
        <Card.Content className="pt-0">
          <span className="text-2xl font-bold tracking-tight text-warning tabular-nums">
            {loading ? (
              <>
                <span className="inline-block h-8 w-12 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
                <span className="sr-only">Loading…</span>
              </>
            ) : (
              pendingJobs
            )}
          </span>
        </Card.Content>
      </Card>

      <Card variant="secondary">
        <Card.Header className="flex flex-row items-center justify-between gap-2 pb-2">
          <Card.Description className="text-sm font-medium text-muted">
            Completed jobs
          </Card.Description>
          <CheckCircle2 className="size-4 text-accent" aria-hidden="true" />
        </Card.Header>
        <Card.Content className="pt-0">
          <span className="text-2xl font-bold tracking-tight text-accent tabular-nums">
            {loading ? (
              <>
                <span className="inline-block h-8 w-12 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
                <span className="sr-only">Loading…</span>
              </>
            ) : (
              completedJobs
            )}
          </span>
        </Card.Content>
      </Card>

      <Card variant="secondary">
        <Card.Header className="flex flex-row items-center justify-between gap-2 pb-2">
          <Card.Description className="text-sm font-medium text-muted">
            Closed jobs
          </Card.Description>
          <XCircle className="size-4 text-danger" aria-hidden="true" />
        </Card.Header>
        <Card.Content className="pt-0">
          <span className="text-2xl font-bold tracking-tight text-danger tabular-nums">
            {loading ? (
              <>
                <span className="inline-block h-8 w-12 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
                <span className="sr-only">Loading…</span>
              </>
            ) : (
              closedJobs
            )}
          </span>
        </Card.Content>
      </Card>
    </div>
  );
}

export default JdStats;
