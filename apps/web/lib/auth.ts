import type { NextAuthOptions, User } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'

import { APP_BASE_URL } from '@/lib/env'

type LoginPayload = {
 access_token: string
 user: {
 id: string
 email: string
 name?: string | null
 role?: string | null
 tenant_id?: string | null
 }
}

interface AppUser extends User {
 apiToken?: string
 role?: string
 tenantId?: string
}

export const authOptions: NextAuthOptions = {
 session: {
 strategy: 'jwt'
 },
 providers: [
 CredentialsProvider({
 name: 'Demo Credentials',
 credentials: {
 email: { label: 'Email', type: 'email' },
 password: { label: 'Password', type: 'password' }
 },
 async authorize(credentials) {
 const response = await fetch(APP_BASE_URL + '/api/proxy/auth/login', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 email: credentials?.email,
 password: credentials?.password
 }),
 cache: 'no-store'
 })

 if (!response.ok) {
 return null
 }

 const payload = (await response.json()) as LoginPayload
 return {
 id: payload.user.id,
 email: payload.user.email,
 name: payload.user.name ?? undefined,
 role: payload.user.role ?? undefined,
 tenantId: payload.user.tenant_id ?? undefined,
 apiToken: payload.access_token
 } as AppUser
 }
 })
 ],
 callbacks: {
 async jwt({ token, user }) {
 if (user) {
 const appUser = user as AppUser
 token.apiToken = appUser.apiToken
 token.role = appUser.role
 token.tenantId = appUser.tenantId
 }
 return token
 },
 async session({ session, token }) {
 session.apiToken = token.apiToken
 if (session.user) {
 session.user.role = token.role
 session.user.tenantId = token.tenantId
 }
 return session
 }
 },
 pages: {
 signIn: '/login'
 },
 secret: process.env.NEXTAUTH_SECRET
}
