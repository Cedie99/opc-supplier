"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { EyeIcon, Loader2Icon, SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { ActionState } from "@/lib/action-state";

/** Shows the email exactly as the recipient sees it, in a sandboxed frame (no scripts). */
export function EmailPreviewDialog({ subject, html, to }: { subject: string; html: string; to: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="xs" variant="outline">
          <EyeIcon /> Preview
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="pr-6">{subject}</DialogTitle>
          <DialogDescription>To {to}</DialogDescription>
        </DialogHeader>
        <iframe title={`Preview of ${subject}`} srcDoc={html} sandbox="allow-popups" className="h-[60vh] w-full rounded-2xl border bg-white" />
      </DialogContent>
    </Dialog>
  );
}

export function ResendButton({ action }: { action: () => Promise<ActionState> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="xs"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await action();
          if (res.error) toast.error(res.error);
          else toast.success(res.message ?? "Sent.");
          router.refresh();
        })
      }
    >
      {pending ? <Loader2Icon className="animate-spin" /> : <SendIcon />} Send
    </Button>
  );
}
