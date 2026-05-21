import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import npLogo from "@/assets/np-logo.png";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});


function LoginPage() {
  const { user, loading, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/" });
  }, [user, loading, navigate]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);
    if (mode === "signin") {
      const { error } = await signIn(email, password);
      setSubmitting(false);
      if (error) setError(error.message);
      else navigate({ to: "/" });
    } else {
      const { error, needsConfirmation } = await signUp(email, password);
      setSubmitting(false);
      if (error) {
        setError(error.message);
      } else if (needsConfirmation) {
        setInfo("Check your email to confirm your account before signing in.");
        setMode("signin");
      } else {
        navigate({ to: "/" });
      }
    }
  };

  const switchMode = () => {
    setMode((m) => (m === "signin" ? "signup" : "signin"));
    setError(null);
    setInfo(null);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <img
            src={npLogo}
            alt="Novo Pharma"
            className="w-auto object-contain"
            style={{ maxHeight: 56 }}
          />
        </div>
        <div className="rounded-xl border border-border bg-card p-6 shadow-[0_1px_4px_rgba(27,42,74,0.06)]">
          <div className="mb-5">
            <h1 className="text-lg font-bold text-foreground">Welcome back</h1>
            <p className="mt-1 text-xs text-muted-foreground">Operations dashboard</p>
          </div>


        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
              minLength={mode === "signup" ? 6 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}
          {info && (
            <p className="rounded-md bg-[#E8F8FA] px-3 py-2 text-xs text-[#00B8C8]">
              {info}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            {mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            {mode === "signin" ? "Don't have an account?" : "Already have an account?"}{" "}
            <button
              type="button"
              onClick={switchMode}
              className="font-medium text-[#00B8C8] hover:underline"
            >
              {mode === "signin" ? "Sign up" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

