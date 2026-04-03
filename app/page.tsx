import { HomeActions } from "@/components/home-actions";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@heroui/react";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-8 p-8">
      <Card className="w-full max-w-lg">
        <Card.Header>
          <Card.Title>Smart Hire</Card.Title>
          <Card.Description>
            Next.js, Supabase, Tailwind CSS v4, and HeroUI — sign in with
            admin-provisioned accounts. No public sign-up.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <HomeActions signedIn={Boolean(user)} />
        </Card.Content>
      </Card>
    </div>
  );
}
