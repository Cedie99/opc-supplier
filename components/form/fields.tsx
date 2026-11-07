"use client";

import { use } from "react";
import { useFormStatus } from "react-dom";
import { FormPendingContext } from "./action-form";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { FieldErrorText } from "./field-errors";

export function SubmitButton({ children, pendingText, ...props }: React.ComponentProps<typeof Button> & { pendingText?: string }) {
  const status = useFormStatus();
  const pending = use(FormPendingContext) || status.pending;
  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending && <Loader2Icon className="animate-spin" />}
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}

type FieldProps = {
  label: string;
  name: string;
  hint?: string;
  required?: boolean;
  className?: string;
};

export function TextField({
  label,
  name,
  hint,
  required,
  className,
  ...input
}: FieldProps & Omit<React.ComponentProps<typeof Input>, "name">) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={name}>
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      <Input id={name} name={name} required={required} {...input} />
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      <FieldErrorText name={name} />
    </div>
  );
}

export function TextAreaField({
  label,
  name,
  hint,
  required,
  className,
  ...input
}: FieldProps & Omit<React.ComponentProps<typeof Textarea>, "name">) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={name}>
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      <Textarea id={name} name={name} required={required} {...input} />
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      <FieldErrorText name={name} />
    </div>
  );
}

/** Native select: simple, accessible and works inside server-action forms without extra state. */
export function SelectField({
  label,
  name,
  hint,
  required,
  className,
  options,
  placeholder,
  ...select
}: FieldProps &
  Omit<React.ComponentProps<"select">, "name"> & {
    options: { value: string; label: string }[];
    placeholder?: string;
  }) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={name}>
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      <NativeSelect id={name} name={name} required={required} {...select}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </NativeSelect>
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      <FieldErrorText name={name} />
    </div>
  );
}

export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "border-input bg-card focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full min-w-0 rounded-full border px-4 text-sm outline-none focus-visible:ring-3 disabled:opacity-50 dark:bg-input/30",
        className,
      )}
      {...props}
    />
  );
}

export function CheckboxField({ label, name, hint, defaultChecked }: { label: string; name: string; hint?: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="accent-primary mt-0.5 size-4" />
      <span>
        <span className="font-medium">{label}</span>
        {hint && <span className="text-muted-foreground block text-xs">{hint}</span>}
      </span>
    </label>
  );
}
