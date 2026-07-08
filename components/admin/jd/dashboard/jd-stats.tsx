"use client";

import React from "react";
import { Briefcase, FileCode2, PlayCircle, XCircle } from "lucide-react";
import { useJdDashboard } from "./context";
import { DataTableStats } from "@/components/admin/shell/table-system";

export function JdStats() {
  const { total, statusCounts } = useJdDashboard();

  const totalJobs = total;
  const draftJobs = statusCounts.Pending;
  const activeJobs = statusCounts.Hiring;
  const closedJobs = statusCounts.Closed + statusCounts.Done;

  const stats = [
    {
      label: "Total Positions",
      value: totalJobs,
      icon: <Briefcase className="h-4.5 w-4.5" />,
      description: "All job description entries"
    },
    {
      label: "Draft / Pending",
      value: draftJobs,
      icon: <FileCode2 className="h-4.5 w-4.5 text-warning" />,
      description: "Awaiting review or publish"
    },
    {
      label: "Published / Active",
      value: activeJobs,
      icon: <PlayCircle className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />,
      description: "Actively sourcing applicants"
    },
    {
      label: "Closed / Completed",
      value: closedJobs,
      icon: <XCircle className="h-4.5 w-4.5 text-danger" />,
      description: "Recruitment finalized"
    }
  ];

  return <DataTableStats stats={stats} />;
}

export default JdStats;
