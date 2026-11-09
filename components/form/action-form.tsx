"use client";

import { createContext, startTransition, useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertCircleIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { sendToStorage, uploadFormFiles, UploadFailure, type RequestUpload, type UploadCache } from "@/lib/direct-upload";
import { FieldErrorsContext } from "./field-errors";

export const FormPendingContext = createContext(false);

type Props = Omit<React.ComponentProps<"form">, "action" | "onSubmit"> & {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  /** Toast shown when the action succeeds (unless the action returns its own message). */
  successMessage?: string;
  resetOnSuccess?: boolean;
  onSuccess?: (state: ActionState) => void;
  /** For forms with file inputs: permission to send each file directly to storage. */
  requestUpload?: RequestUpload;
};

/**
 * A form bound to a server action: shows errors, field errors and a success toast.
 * It submits through onSubmit (not the `action` prop) so React does not clear the fields
 * when the server returns a validation error.
 */
export function ActionForm({ action, successMessage, resetOnSuccess, onSuccess, requestUpload, children, ...props }: Props) {
  const [state, formAction, actionPending] = useActionState(action, initialActionState);
  const formRef = useRef<HTMLFormElement>(null);
  const uploadCache = useRef<UploadCache>(new Map());
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<{ message: string; field?: string } | null>(null);
  const pending = actionPending || uploading;

  const submit = async (fd: FormData) => {
    setUploading(true);
    setUploadError(null);
    try {
      const send = sendToStorage(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      await uploadFormFiles(fd, requestUpload!, send, uploadCache.current);
      startTransition(() => formAction(fd));
    } catch (err) {
      if (err instanceof UploadFailure) setUploadError({ message: err.message, field: err.field });
      else {
        console.error("[upload] failed", err);
        setUploadError({ message: "The files could not be uploaded. Please try again." });
      }
    } finally {
      setUploading(false);
    }
  };

  const error = uploadError?.message ?? state.error;
  const fieldErrors = uploadError?.field ? { ...state.fieldErrors, [uploadError.field]: [uploadError.message] } : (state.fieldErrors ?? {});

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
        if (requestUpload) void submit(fd);
        else startTransition(() => formAction(fd));
      }}
    >
      <FormPendingContext value={pending}>
        <FieldErrorsContext value={fieldErrors}>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircleIcon />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {children}
        </FieldErrorsContext>
      </FormPendingContext>
    </form>
  );
}
