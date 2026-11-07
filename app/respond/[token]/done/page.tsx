import { CheckCircle2Icon } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Reply sent", robots: { index: false } };

export default function DonePage() {
  return (
    <main className="bg-muted/40 flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="items-center">
          <CheckCircle2Icon className="text-primary mx-auto mb-2 size-10" />
          <CardTitle>Reply sent</CardTitle>
          <CardDescription>Thank you. Our Purchasing team has been notified and will get back to you if anything else is needed.</CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}
