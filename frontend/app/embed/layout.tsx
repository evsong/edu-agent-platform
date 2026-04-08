"use client";

import { Suspense } from "react";
import { AuthProvider } from "@/lib/auth";

export default function EmbedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <Suspense fallback={<div className="flex items-center justify-center h-screen text-ink-text-muted text-sm">Loading...</div>}>
        <div className="min-h-screen bg-white">
          {children}
        </div>
      </Suspense>
    </AuthProvider>
  );
}
