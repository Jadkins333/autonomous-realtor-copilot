import CredentialsProvider from "next-auth/providers/credentials";

import { APP_BASE_URL } from "@/lib/env";

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
        const response = await fetch(`${APP_BASE_URL}/api/proxy/auth/login`, {
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
    async jwt({ token, user }) {
      if (user) {
        token.apiToken = (user as any).apiToken;
        token.role = (user as any).role;
        token.tenantId = (user as any).tenantId;
      }
      return token;
    },
    async session({ session, token }) {
      (session as any).apiToken = token.apiToken;
      (session.user as any).role = token.role;
      (session.user as any).tenantId = token.tenantId;
      return session;
    }
  },
  pages: {
    signIn: "/login"
  },
  secret: process.env.NEXTAUTH_SECRET
};
