"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export interface User {
  id: string;
  email: string;
  name: string;
  role: "teacher" | "student" | "admin";
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function decodePayload(token: string): User | null {
  try {
    const base64 = token.split(".")[1];
    const json = atob(base64.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as {
      sub: string;
      email: string;
      name: string;
      role: "teacher" | "student" | "admin";
    };
    return {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role,
    };
  } catch {
    return null;
  }
}

/** Read token from localStorage (safe on server — returns null). */
function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem("token");
  if (!stored) return null;
  // Validate that it decodes before accepting
  const decoded = decodePayload(stored);
  if (!decoded) {
    localStorage.removeItem("token");
    return null;
  }
  return stored;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Start with null to match server-rendered HTML (avoids hydration mismatch)
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Hydrate from localStorage after mount (client-only)
  useEffect(() => {
    const stored = getStoredToken();
    if (stored) {
      setToken(stored);
      setUser(decodePayload(stored));
    }
    setIsLoading(false);
  }, []);

  const login = useCallback((newToken: string) => {
    localStorage.setItem("token", newToken);
    setToken(newToken);
    const decoded = decodePayload(newToken);
    setUser(decoded);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, token, isLoading, login, logout }),
    [user, token, isLoading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
