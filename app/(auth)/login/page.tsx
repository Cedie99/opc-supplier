import type { Metadata } from "next";
import { AlertCircleIcon } from "lucide-react";
import { AppIcon, BrandLockup } from "@/components/brand";
import { LoginIllustration } from "@/components/login-illustration";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionForm } from "@/components/form/action-form";
import { SubmitButton } from "@/components/form/fields";
import { FieldErrorText } from "@/components/form/field-errors";
import { signIn, signOut } from "../actions";

export const metadata: Metadata = { title: "Sign in" };

const pillInput =
  "h-11 rounded-full border-0 bg-black/25 px-5 text-base text-white placeholder:text-white/45 focus-visible:ring-2 focus-visible:ring-highlight/70 md:text-sm";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  const nextPath = typeof next === "string" ? next : "";
  const year = new Date().getFullYear();

  return (
    <main className="bg-forest relative flex min-h-svh items-center justify-center overflow-hidden p-4 md:p-8">
      {/* Background shapes */}
      <div aria-hidden className="pointer-events-none absolute -top-40 -left-40 size-[34rem] rounded-full bg-white/[0.04]" />
      <div aria-hidden className="pointer-events-none absolute -right-48 -bottom-56 size-[40rem] rounded-full bg-white/[0.05]" />

      <div className="bg-primary relative grid w-full max-w-6xl overflow-hidden rounded-[2rem] shadow-2xl shadow-black/30 lg:min-h-[640px] lg:grid-cols-[60%_40%]">
        {/* White curved panel */}
        <svg aria-hidden viewBox="0 0 600 640" preserveAspectRatio="none" className="pointer-events-none absolute inset-y-0 left-0 hidden h-full w-[66%] lg:block">
          <path
            d="M0 0H452C392 64 380 150 452 232C528 318 534 430 470 516C430 570 404 606 400 640H0Z"
            fill="#ffffff"
          />
        </svg>

        {/* Left: brand + illustration */}
        <section className="relative hidden flex-col justify-between p-10 text-neutral-900 lg:flex">
          <BrandLockup tone="light" />
          <LoginIllustration className="mx-auto w-full max-w-[460px]" />
          <div className="text-muted-foreground text-xs leading-relaxed">
            © {year} Oracle Petroleum Corporation
            <br />
            Supplier Accreditation and Evaluation Program
          </div>
        </section>

        {/* Right: form */}
        <section className="relative flex flex-col justify-between gap-10 p-8 text-white sm:p-12 lg:pl-6">
          <div className="flex items-center gap-3 lg:invisible">
            <AppIcon className="size-10" />
            <div className="leading-tight">
              <p className="font-semibold">Supplier Accreditation</p>
              <p className="text-xs text-white/70">Oracle Petroleum</p>
            </div>
          </div>

          <div className="mx-auto w-full max-w-xs">
            <h1 className="text-4xl font-semibold">Sign in</h1>
            <p className="mt-2 text-sm text-white/70">Use your company account to continue.</p>

            {error === "no_profile" ? (
              <div className="mt-8 grid gap-4">
                <Alert variant="destructive">
                  <AlertCircleIcon />
                  <AlertDescription>Your account is signed in but has no active staff profile. Ask an administrator to give you access.</AlertDescription>
                </Alert>
                <form action={signOut}>
                  <Button type="submit" className="bg-highlight text-highlight-foreground hover:bg-highlight/90 h-11 w-full rounded-full">
                    Sign out
                  </Button>
                </form>
              </div>
            ) : (
              <ActionForm action={signIn} className="mt-8 grid gap-5">
                <input type="hidden" name="next" value={nextPath} />
                <div className="grid gap-2">
                  <Label htmlFor="email" className="text-base font-medium text-white">
                    Email
                  </Label>
                  <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@company.com" className={pillInput} />
                  <FieldErrorText name="email" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password" className="text-base font-medium text-white">
                    Password
                  </Label>
                  <Input id="password" name="password" type="password" autoComplete="current-password" required placeholder="Enter your password" className={pillInput} />
                  <FieldErrorText name="password" />
                  <p className="text-right text-xs text-white/60">Forgot it? Ask your administrator to reset it.</p>
                </div>
                <SubmitButton pendingText="Signing in…" className="bg-highlight text-highlight-foreground hover:bg-highlight/90 mt-2 h-11 w-full rounded-full text-base font-semibold">
                  Sign in
                </SubmitButton>
              </ActionForm>
            )}
          </div>

          <p className="text-center text-xs text-white/60 lg:text-right">
            Need access? Contact your system administrator
            <br />
            Purchasing Department
          </p>
        </section>
      </div>
    </main>
  );
}
