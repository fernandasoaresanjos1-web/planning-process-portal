import { useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { LoginScreen } from "./LoginScreen";
import { ForcePasswordChange } from "./ForcePasswordChange";
import type { ReactNode } from "react";

export function AuthGate({ children }: { children: ReactNode }) {
  const { loading, session, mustChangePassword, refresh } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  if (path.startsWith("/auth")) return <>{children}</>;
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Carregando…
      </div>
    );
  }
  if (!session) return <LoginScreen />;
  if (mustChangePassword) return <ForcePasswordChange onDone={refresh} />;
  return <>{children}</>;
}

