import { ToastProvider } from "@/components/admin/toast-provider";
import { JobsPage } from "./jobs-app";
import "./jobs.css";

// Shared shell: stays mounted while navigating between the list and /[id] detail so data isn't refetched.
export default function PositionManagement2Layout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <JobsPage embedded />
      {children}
    </ToastProvider>
  );
}
