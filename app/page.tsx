import { redirect } from "next/navigation";
import { getRequestAuth } from "@/lib/admin/request-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { user } = await getRequestAuth();

  if (user) {
    redirect("/dashboard");
  } else {
    redirect("/login");
  }
}
