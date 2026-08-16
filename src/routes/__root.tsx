import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth-context";
import { AuthGate } from "@/components/AuthGate";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Governança Operacional" },
      { name: "description", content: "Central de processos e indicadores mensais." },
      { property: "og:title", content: "Governança Operacional" },
      { name: "twitter:title", content: "Governança Operacional" },
      { property: "og:description", content: "Central de processos e indicadores mensais." },
      { name: "twitter:description", content: "Central de processos e indicadores mensais." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/3d3f2825-3fff-4fea-afa1-52335b424f15" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/3d3f2825-3fff-4fea-afa1-52335b424f15" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="text-6xl font-extrabold text-charcoal">404</h1>
        <p className="mt-3 text-muted-foreground">Página não encontrada</p>
        <a href="/" className="mt-6 inline-block rounded-md bg-brand px-4 py-2 text-sm font-semibold text-charcoal">Voltar ao Hub</a>
      </div>
    </div>
  ),
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthGate>
          <Outlet />
        </AuthGate>
      </AuthProvider>
      <Toaster />
    </QueryClientProvider>
  );
}
