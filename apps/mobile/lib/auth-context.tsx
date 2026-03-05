import * as SecureStore from "expo-secure-store";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

import { login } from "./api";
import type { DemoUser } from "./types";

const TOKEN_KEY = "ari_demo_token";
const USER_KEY = "ari_demo_user";

type AuthContextValue = {
  token: string | null;
  user: DemoUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<DemoUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const [storedToken, storedUser] = await Promise.all([
          SecureStore.getItemAsync(TOKEN_KEY),
          SecureStore.getItemAsync(USER_KEY)
        ]);
        if (cancelled) return;
        setToken(storedToken || null);
        if (storedUser) {
          try {
            setUser(JSON.parse(storedUser) as DemoUser);
          } catch {
            await SecureStore.deleteItemAsync(USER_KEY);
            setUser(null);
          }
        } else {
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      loading,
      signIn: async (email: string, password: string) => {
        const payload = await login(email.trim(), password);
        await Promise.all([
          SecureStore.setItemAsync(TOKEN_KEY, payload.access_token),
          SecureStore.setItemAsync(USER_KEY, JSON.stringify(payload.user))
        ]);
        setToken(payload.access_token);
        setUser(payload.user);
      },
      signOut: async () => {
        await Promise.all([SecureStore.deleteItemAsync(TOKEN_KEY), SecureStore.deleteItemAsync(USER_KEY)]);
        setToken(null);
        setUser(null);
      }
    }),
    [loading, token, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
