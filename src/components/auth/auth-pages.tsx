"use client";
import { ArrowLeft, Landmark, Lock } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormFields, useZodForm, type FieldDef } from "@/components/forms/fields";
import { describeError } from "@/hooks/use-action";
import { authApi } from "@/lib/api/auth";
import { API_MODE } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/store";
import { useLocale, useT } from "@/lib/i18n/store";
import { ROLE_NAMES, ROLES } from "@/lib/permissions";

const REMEMBER_KEY = "lms-remember-account";
const LOGIN: FieldDef[] = [{ name: "username", label: "Username or email", required: true }, { name: "password", label: "Password", type: "password", required: true }];
const FORGOT: FieldDef[] = [{ name: "email", label: "Email", type: "email", required: true }];
const RESET: FieldDef[] = [{ name: "password", label: "New password", type: "password", required: true, help: "At least 12 characters." }, { name: "confirm", label: "Confirm new password", type: "password", required: true }];

function AuthCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const t = useT();
  const { locale, setLocale } = useLocale();
  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground"><Landmark className="size-4" aria-hidden /></span><span className="font-semibold">{t("Loan Management System")}</span></div>
          <div className="flex gap-1 text-sm" role="group" aria-label={t("Language")}><Button size="sm" variant={locale === "en" ? "secondary" : "ghost"} onClick={() => setLocale("en")}>EN</Button><Button size="sm" variant={locale === "km" ? "secondary" : "ghost"} onClick={() => setLocale("km")}>ខ្មែរ</Button></div>
        </div>
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h1 className="text-lg font-semibold">{t(title)}</h1>
          {description && <p className="mb-4 mt-1 text-sm text-muted-foreground">{t(description)}</p>}
          <div className={description ? "" : "mt-4"}>{children}</div>
        </div>
      </div>
    </div>
  );
}

function DemoAccounts({ onPick }: { onPick: (username: string) => void }) {
  const t = useT();
  if (API_MODE !== "mock") return null;
  return (
    <details className="mt-4 rounded-md border bg-muted/40 p-3 text-xs">
      <summary className="cursor-pointer font-medium">{t("Demonstration accounts")}</summary>
      <p className="mt-2 text-muted-foreground">{t("All demo accounts use the password")} <code className="font-mono">Demo@Lms2026!</code>. {t("MFA code, where asked:")} <code className="font-mono">123456</code></p>
      <div className="mt-2 grid grid-cols-2 gap-1">{ROLES.map((r) => <button key={r} type="button" className="rounded px-2 py-1 text-left hover:bg-accent" onClick={() => onPick(r.toLowerCase())}>{t(ROLE_NAMES[r])}</button>)}</div>
    </details>
  );
}

export function LoginPage() {
  const t = useT();
  const router = useRouter();
  const { status, bootstrap, applyLogin, setMfaToken, user } = useAuth();
  const form = useZodForm(LOGIN);
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void bootstrap(); }, [bootstrap]);
  useEffect(() => { if (status === "authenticated" && user) router.replace(user.landing); }, [status, user, router]);
  useEffect(() => {
    // Browser storage is only readable after mount, so this must run in an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { const saved = localStorage.getItem(REMEMBER_KEY); if (saved) { form.setValue("username", saved); setRemember(true); } } catch { /* storage unavailable */ }
  }, [form]);
  const submit = form.handleSubmit(async ({ username, password }) => {
    setBusy(true); setError(null);
    try {
      const result = await authApi.login(String(username), String(password));
      try { if (remember) localStorage.setItem(REMEMBER_KEY, String(username)); else localStorage.removeItem(REMEMBER_KEY); } catch { /* storage unavailable */ }
      if (result.mfa_required) { setMfaToken(result.mfa_token ?? null); router.push("/mfa"); return; }
      applyLogin(result);
      router.replace(result.user!.landing);
    } catch (e) { setError(describeError(e)); } finally { setBusy(false); }
  });
  return (
    <AuthCard title="Sign in" description="Use your staff account to continue.">
      <form onSubmit={submit} className="space-y-4">
        <FormFields form={form} fields={LOGIN} columns={1} />
        {error && <p role="alert" className="rounded-md bg-danger-soft p-2 text-sm text-danger">{t(error)}</p>}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><Checkbox id="remember" checked={remember} onCheckedChange={(v) => setRemember(v === true)} /><Label htmlFor="remember">{t("Remember account")}</Label></div>
          <Link className="text-sm text-primary hover:underline" href="/forgot-password">{t("Forgot password?")}</Link>
        </div>
        <Button type="submit" className="w-full" disabled={busy}>{t(busy ? "Signing in…" : "Sign in")}</Button>
      </form>
      <DemoAccounts onPick={(u) => { form.setValue("username", u); form.setValue("password", "Demo@Lms2026!"); }} />
    </AuthCard>
  );
}

export function MfaPage() {
  const t = useT();
  const router = useRouter();
  const { mfaToken, applyLogin } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!mfaToken) router.replace("/login"); }, [mfaToken, router]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) return setError("Enter the 6-digit code from your authenticator app.");
    setBusy(true); setError(null);
    try { const r = await authApi.verifyMfa(mfaToken!, code); applyLogin(r); router.replace(r.user!.landing); }
    catch (err) { setError(describeError(err)); } finally { setBusy(false); }
  };
  return (
    <AuthCard title="Multi-factor verification" description="Enter the 6-digit code from your authenticator app.">
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5"><Label htmlFor="mfa">{t("Verification code")}</Label><Input id="mfa" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="text-center font-mono text-lg tracking-[0.4em]" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus /></div>
        {error && <p role="alert" className="rounded-md bg-danger-soft p-2 text-sm text-danger">{t(error)}</p>}
        <Button type="submit" className="w-full" disabled={busy}>{t(busy ? "Verifying…" : "Verify")}</Button>
        <Link href="/login" className="flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" />{t("Back to sign in")}</Link>
      </form>
    </AuthCard>
  );
}

export function ForgotPasswordPage() {
  const t = useT();
  const form = useZodForm(FORGOT);
  const [sent, setSent] = useState(false);
  const submit = form.handleSubmit(async ({ email }) => { await authApi.requestPasswordReset(String(email)).catch(() => undefined); setSent(true); });
  return (
    <AuthCard title="Forgot password" description="We will send a single-use reset link valid for 30 minutes.">
      {sent ? <p className="rounded-md bg-success-soft p-3 text-sm text-success">{t("If the account exists, instructions have been sent.")}</p> : (
        <form onSubmit={submit} className="space-y-4"><FormFields form={form} fields={FORGOT} columns={1} /><Button type="submit" className="w-full">{t("Send reset link")}</Button></form>
      )}
      <div className="mt-4 flex justify-between text-sm"><Link className="text-primary hover:underline" href="/login">{t("Back to sign in")}</Link>{API_MODE === "mock" && <Link className="text-primary hover:underline" href="/reset-password?token=demo">{t("Open demo reset form")}</Link>}</div>
    </AuthCard>
  );
}

function ResetForm() {
  const t = useT();
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const form = useZodForm(RESET);
  const submit = form.handleSubmit(async ({ password, confirm }) => {
    if (String(password).length < 12) return form.setError("password", { message: "Password must be at least 12 characters." });
    if (password !== confirm) return form.setError("confirm", { message: "Passwords do not match." });
    await authApi.completePasswordReset(token, String(password));
    toast.success(t("Password updated. Please sign in."));
    router.replace("/login");
  });
  return <form onSubmit={submit} className="space-y-4"><FormFields form={form} fields={RESET} columns={1} /><Button type="submit" className="w-full">{t("Update password")}</Button></form>;
}

export function ResetPasswordPage() {
  return <AuthCard title="Reset password"><Suspense><ResetForm /></Suspense></AuthCard>;
}

export function AccessDeniedPage() {
  const t = useT();
  return (
    <AuthCard title="Access denied" description="Your account does not have permission to view this page.">
      <div className="flex items-center gap-3 rounded-md bg-danger-soft p-3 text-sm text-danger"><Lock className="size-4" aria-hidden />{t("Contact your administrator if you need access.")}</div>
      <Button asChild className="mt-4 w-full"><Link href="/">{t("Return to the application")}</Link></Button>
    </AuthCard>
  );
}

export function RootRedirect() {
  const router = useRouter();
  const { status, user, bootstrap } = useAuth();
  useEffect(() => { void bootstrap(); }, [bootstrap]);
  useEffect(() => {
    if (status === "authenticated" && user) router.replace(user.landing);
    if (status === "anonymous") router.replace("/login");
  }, [status, user, router]);
  return null;
}
