import { CheckCircle2Icon } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Registration submitted", robots: { index: false } };

export default async function DonePage({ searchParams }: PageProps<"/register/[token]/done">) {
  const { reupload } = await searchParams;
  const isReupload = reupload === "1";
  return (
    <main className="bg-muted/40 flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="items-center">
          <CheckCircle2Icon className="text-primary mx-auto mb-2 size-10" />
          <CardTitle>{isReupload ? "Documents submitted" : "Registration submitted"}</CardTitle>
          <CardDescription>
            {isReupload
              ? "Thank you. Our Purchasing team will review the new files and contact you if anything else is needed."
              : "Thank you. Our Purchasing team will review your documents and contact you about the next steps."}
          </CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}
