import { ToastProvider } from "@/components/admin/toast-provider";
import "../position-management-2/jobs.css";
import "./cal.css";

export default function Calendar2Layout({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
