"use client";

import { createContext, startTransition, useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { AlertCircleIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { FieldErrorsContext } from "./field-errors";

export const FormPendingContext = createContext(false);

type Props = Omit<React.ComponentProps<"form">, "action" | "onSubmit"> & {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  /** Toast shown when the action succeeds (unless the action returns its own message). */
  successMessage?: string;
  resetOnSuccess?: boolean;
  onSuccess?: (state: ActionState) => void;
};

/**
 * A form bound to a server action: shows errors, field errors and a success toast.
 * It submits through onSubmit (not the `action` prop) so React does not clear the fields
 * when the server returns a validation error.
 */
export function ActionForm({ action, successMessage, resetOnSuccess, onSuccess, children, ...props }: Props) {
  const [state, formAction, pending] = useActionState(action, initialActionState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      const msg = state.message ?? successMessage;
      if (msg) toast.success(msg);
      if (resetOnSuccess) formRef.current?.reset();
      onSuccess?.(state);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form
      ref={formRef}
      // If someone submits before JavaScript has loaded, the browser falls back to a native submit.
      // POST keeps field values (passwords!) out of the URL and browser history.
      method="post"
      {...props}
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        startTransition(() => formAction(fd));
      }}
    >
      <FormPendingContext value={pending}>
        <FieldErrorsContext value={state.fieldErrors ?? {}}>
          {state.error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircleIcon />
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          {children}
        </FieldErrorsContext>
      </FormPendingContext>
    </form>
  );
}
