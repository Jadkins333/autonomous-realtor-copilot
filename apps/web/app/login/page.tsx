"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Building2, Lock, Mail, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("agent@demo.local");
  const [password, setPassword] = useState("demo123");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const result = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (result?.error) {
      setError("Invalid credentials. Try agent@demo.local / demo123");
      return;
    }
    router.push("/dashboard");
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{ background: "radial-gradient(ellipse at 30% 20%, rgba(249,115,22,0.08) 0%, transparent 60%), #0f1117" }}
    >
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
            style={{ background: "linear-gradient(135deg, #f97316, #ec4899)" }}>
            <Building2 className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            Realtor Copilot
          </h1>
          <p className="text-white/40 text-sm mt-1">Columbus, OH · Public Data Intelligence</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-white/[0.08] bg-[#13161f] p-7">
          <h2 className="text-base font-semibold text-white mb-1">Sign in</h2>
          <p className="text-xs text-white/40 mb-6">Demo credentials are pre-filled below.</p>

          {error && (
            <div className="flex items-center gap-2 mb-4 px-3 py-2.5 rounded-lg bg-red-500/8 border border-red-500/20">
              <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}

          <form className="space-y-3" onSubmit={onSubmit}>
            <div>
              <label className="block text-xs text-white/50 mb-1.5 font-medium">Email</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-orange-500/50 focus:border-orange-500/40"
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-white/50 mb-1.5 font-medium">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl pl-10 pr-10 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-orange-500/50 focus:border-orange-500/40"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl font-semibold text-sm text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-1"
              style={{ background: loading ? "rgba(249,115,22,0.5)" : "linear-gradient(135deg, #f97316, #ea580c)" }}
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Signing in…
                </>
              ) : "Sign in"}
            </button>
          </form>
        </div>

        {/* Footer note */}
        <p className="text-center text-[10px] text-white/20 mt-6">
          Sandbox mode · Seeded Columbus data · No PII stored
        </p>
      </div>
    </div>
  );
}
