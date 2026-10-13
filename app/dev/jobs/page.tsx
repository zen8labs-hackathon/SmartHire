"use client";

import { notFound } from "next/navigation";
import { ToastProvider } from "@/components/admin/toast-provider";
import { JobsPage } from "@/app/admin/position-management-2/jobs-app";
import "@/app/admin/position-management-2/jobs.css";

export default function DevJobsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <ToastProvider>
      <JobsPage />
    </ToastProvider>
  );
}
