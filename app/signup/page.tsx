import { redirect } from "next/navigation";

export default function SignUpPage() {
  redirect("/login?reason=no-signup");
}
