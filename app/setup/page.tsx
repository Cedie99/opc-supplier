import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isSupabaseConfigured } from "@/lib/env";
import { BrandMark } from "@/components/brand";

export const metadata = { title: "Setup required" };

export default async function SetupPage() {
  await connection(); // read the env at request time, not build time
  if (isSupabaseConfigured()) redirect("/login");
  return (
    <main className="bg-muted/40 flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <BrandMark className="mb-2 size-10" />
          <CardTitle>Connect Supabase to finish setup</CardTitle>
          <CardDescription>The app is installed, but the Supabase keys are not set yet.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              Copy <code className="bg-muted rounded px-1">.env.example</code> to <code className="bg-muted rounded px-1">.env.local</code>.
            </li>
            <li>Fill in the Supabase URL, anon key, service role key and the database connection strings.</li>
            <li>
              Run <code className="bg-muted rounded px-1">npm run db:migrate</code>, then <code className="bg-muted rounded px-1">npm run setup</code>.
            </li>
            <li>Restart the dev server and sign in with the administrator account.</li>
          </ol>
          <p className="text-muted-foreground">See README.md for the full steps.</p>
        </CardContent>
      </Card>
    </main>
  );
}
