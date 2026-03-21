import type { NextAuthOptions, Session, User } from "next-auth";
import type { JWT } from "next-auth/jwt";
import CredentialsProvider from "next-auth/providers/credentials";

import { API_INTERNAL_URL } from "@/lib/env";

type LoginPayload = {
  access_token: string;
  user: {
    id: string;
    email?: string | null;
    name?: string | null;
    role?: string | null;
    tenant_id?: string | null;
  };
};

type AppUser = User & {
  apiToken?: string;
  role?: string;
  tenantId?: string;
};

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

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt"
  },
  providers: [
    CredentialsProvider({
      name: "Demo Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials): Promise<AppUser | null> {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const tenantSlug = process.env.DEMO_TENANT_SLUG || "demo-realty";
        const response = await fetch(`${API_INTERNAL_URL}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenant_slug: tenantSlug,
            email: credentials?.email,
            password: credentials?.password
          }),
          cache: "no-store"
        });

        if (!response.ok) {
          return null;
        }

        const payload = (await response.json()) as LoginPayload;
        return {
          id: payload.user.id,
          email: payload.user.email ?? undefined,
          name: payload.user.name ?? undefined,
          role: payload.user.role ?? undefined,
          tenantId: payload.user.tenant_id ?? undefined,
          apiToken: payload.access_token
        };
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      const authToken = token as AuthToken;
      const authUser = user as (AuthUser & AppUser) | undefined;

      if (authUser) {
        authToken.apiToken = authUser.apiToken;
        authToken.role = authUser.role;
        authToken.tenantId = authUser.tenantId;
      }

      return authToken;
    },
    async session({ session, token }) {
      const authSession = session as Session & {
        apiToken?: string;
        user?: Session["user"] & {
          role?: string;
          tenantId?: string;
        };
      };
      const authToken = token as AuthToken;

      authSession.apiToken = authToken.apiToken;
      if (authSession.user) {
        authSession.user.role = authToken.role;
        authSession.user.tenantId = authToken.tenantId;
      }

      return authSession;
    }
  },
  pages: {
    signIn: "/login"
  },
  secret: process.env.NEXTAUTH_SECRET
};
