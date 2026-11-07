"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckIcon, Undo2Icon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/form/form-dialog";
import { TextAreaField } from "@/components/form/fields";
import type { ActionState } from "@/lib/action-state";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/** Approve / return buttons for an approver. */
export function DecisionButtons({ action, approveHint, entityLabel }: { action: Action; approveHint: string; entityLabel: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <FormDialog
        trigger={
          <Button>
            <CheckIcon /> Approve
          </Button>
        }
        title={`Approve ${entityLabel}`}
        description={approveHint}
        action={action}
        submitLabel="Approve"
      >
        <input type="hidden" name="decision" value="approve" />
        <TextAreaField label="Note (optional)" name="note" rows={2} />
      </FormDialog>
      <FormDialog
        trigger={
          <Button variant="outline">
            <Undo2Icon /> Return for changes
          </Button>
        }
        title={`Return ${entityLabel}`}
        description="The preparer can edit and resubmit it."
        action={action}
        submitLabel="Return"
      >
        <input type="hidden" name="decision" value="return" />
        <TextAreaField label="What needs to change" name="note" rows={3} required />
      </FormDialog>
    </div>
  );
}

/** A button that runs a no-input server action, with a confirmation step built into the page. */
export function ConfirmActionButton({
  action,
  label,
  confirmLabel,
  variant = "outline",
}: {
  action: () => Promise<ActionState>;
  label: string;
  confirmLabel: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <FormDialog
      trigger={
        <Button variant={variant} size="sm">
          <XIcon /> {label}
        </Button>
      }
      title={confirmLabel}
      action={async () => {
        const res = await action();
        if (res.error) toast.error(res.error);
        start(() => router.refresh());
        return res;
      }}
      submitLabel={pending ? "Working…" : label}
      submitVariant="destructive"
    >
      <p className="text-muted-foreground text-sm">This cannot be undone.</p>
    </FormDialog>
  );
}
