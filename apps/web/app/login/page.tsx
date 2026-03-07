"use client";

import React from "react"; 
import { useState } from "react"; 
import type { FormEvent } from "react"; 
import { signIn } from "next-auth/react"; 
import { useRouter } from "next/navigation"; 
 
import { Button } from "@/components/ui/button"; 
import { Card, CardDescription, CardTitle } from "@/components/ui/card"; 
import { Input } from "@/components/ui/input"; 
 
export default function LoginPage() { 
  const router = useRouter(); 
  const [tenantSlug, setTenantSlug] = useState("demo-realty"); 
  const [email, setEmail] = useState("agent@demo.local"); 
  const [password, setPassword] = useState("demo123"); 
  const [error, setError] = useState<string | null>(null); 
  const [loading, setLoading] = useState(false); 
 
  async function onSubmit(event: FormEvent) { 
    event.preventDefault(); 
    setLoading(true); 
    setError(null); 
 
    const result = await signIn("credentials", { 
      tenant_slug: tenantSlug.trim(), 
      email, 
      password, 
      redirect: false 
    }); 
 
    setLoading(false); 
    if (result?.error) { 
      setError("Invalid credentials"); 
      return; 
    } 
 
    router.push("/dashboard"); 
  } 
 
  return ( 
    <div className="flex min-h-screen items-center justify-center p-4"> 
      <Card className="w-full max-w-md"> 
        <CardTitle className="mb-1">Demo Login</CardTitle> 
        <CardDescription className="mb-6"> 
          Use demo credentials to access sandbox mode outreach and seeded Columbus data. 
        </CardDescription> 
        <form className="space-y-3" onSubmit={onSubmit}> 
          <Input 
            placeholder="Tenant slug" 
            value={tenantSlug} 
            onChange={(e) => setTenantSlug(e.target.value)} 
          /> 
          <Input 
            type="email" 
            placeholder="Email" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
          /> 
          <Input 
            type="password" 
            placeholder="Password" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
          /> 
          {error ? <p className="text-sm text-red-700">Invalid credentials</p> : null} 
          <Button className="w-full" disabled={loading} type="submit"> 
            {loading ? "Signing in..." : "Sign in"} 
          </Button> 
        </form> 
      </Card> 
    </div> 
  ); 
} 
