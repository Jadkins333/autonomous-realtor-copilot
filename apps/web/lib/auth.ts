import type { Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import CredentialsProvider from "next-auth/providers/credentials";

import { API_INTERNAL_URL } from "@/lib/env";

type AuthUser = {
  apiToken?: string;
  role?: string;
  tenantId?: string;
};

type AuthToken = JWT & {
  apiToken?: string;
  role?: string;
  tenantId?: string;
};

export const authOptions = {
  session: {
    strategy: "jwt" as const
  },
  providers: [
    CredentialsProvider({
      name: "Demo Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        const response = await fetch(`${API_INTERNAL_URL}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: credentials?.email,
            password: credentials?.password
          }),
          cache: "no-store"
        });

        if (!response.ok) {
          return null;
        }

        const payload = await response.json();
        return {
          id: payload.user.id,
          email: payload.user.email,
          name: payload.user.name,
          role: payload.user.role,
          tenantId: payload.user.tenant_id,
          apiToken: payload.access_token
        } as any;
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }: { token: AuthToken; user?: AuthUser }) {
      if (user) {
        token.apiToken = user.apiToken;
        token.role = user.role;
        token.tenantId = user.tenantId;
      }
      return token;
    },
    async session({ session, token }: { session: Session; token: AuthToken }) {
      session.apiToken = token.apiToken;
      session.user.role = token.role;
      session.user.tenantId = token.tenantId;
      return session;
    }
  },
  pages: {
    signIn: "/login"
  },
  secret: process.env.NEXTAUTH_SECRET
};
