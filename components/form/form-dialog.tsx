"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { ActionState } from "@/lib/action-state";
import { ActionForm } from "./action-form";
import { SubmitButton } from "./fields";

/** A button that opens a dialog containing a server-action form. Closes on success. */
export function FormDialog({
  trigger,
  title,
  description,
  action,
  submitLabel = "Save",
  successMessage,
  children,
  submitVariant,
  keepOpenOnSuccess,
  onSuccess,
}: {
  trigger: React.ReactNode;
  title: string;
  description?: string;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel?: string;
  successMessage?: string;
  children: React.ReactNode;
  submitVariant?: React.ComponentProps<typeof Button>["variant"];
  keepOpenOnSuccess?: boolean;
  onSuccess?: (state: ActionState) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <ActionForm
          action={action}
          successMessage={successMessage}
          className="grid gap-4"
          onSuccess={(s) => {
            onSuccess?.(s);
            if (!keepOpenOnSuccess) setOpen(false);
          }}
        >
          {children}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton variant={submitVariant}>{submitLabel}</SubmitButton>
          </DialogFooter>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
