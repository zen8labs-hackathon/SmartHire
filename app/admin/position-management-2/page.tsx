"use client";

import { ToastProvider } from "@/components/admin/toast-provider";
import { JobsPage } from "@/app/dev/jobs/jobs-app";
import "@/app/dev/jobs/jobs.css";

// New Position Management design. Mock data only (see app/dev/jobs/data.ts); no API calls.
export default function PositionManagement2Page() {
  return (
    <ToastProvider>
      <JobsPage embedded />
    </ToastProvider>
  );
}
