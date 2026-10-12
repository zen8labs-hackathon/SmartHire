"use client";

import { notFound } from "next/navigation";
import { ToastProvider } from "@/components/admin/toast-provider";
import { JobsPage } from "./jobs-app";
import "./jobs.css";

export default function DevJobsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <ToastProvider>
      <JobsPage />
    </ToastProvider>
  );
}
