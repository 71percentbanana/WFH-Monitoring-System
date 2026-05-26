"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Check if already logged in
  useEffect(() => {
    const role = localStorage.getItem("userRole");
    if (role === "admin") {
      router.push("/admin");
    } else if (role === "employee") {
      router.push("/employee");
    } else {
      setIsCheckingAuth(false);
    }
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();

    try {
      // Query our custom users table
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("username", trimmedUsername)
        .eq("password", trimmedPassword)
        .single();

      if (error || !data) {
        setError("Invalid username or password");
        setIsLoading(false);
        return;
      }

      // Successful login
      localStorage.setItem("userRole", data.role);
      localStorage.setItem("userName", data.username);

      if (data.role === "admin") {
        router.push("/admin");
      } else {
        router.push("/employee");
      }
    } catch (err) {
      setError("An error occurred during login.");
      setIsLoading(false);
    }
  };

  if (isCheckingAuth) return null;

  return (
    <div className="min-h-screen bg-[#0B1020] text-slate-100 flex flex-col items-center justify-center p-6 font-sans relative overflow-hidden">
      {/* Background flat canvas */}
      <div className="fixed inset-0 bg-[#0B1020] -z-10" />
      
      <div className="relative max-w-sm w-full mx-auto">
        <div className="relative bg-[#121826] border border-white/5 rounded-[14px] shadow-sm p-6 md:p-8">
          
          <div className="text-center mb-6">
            <h1 className="text-xl font-semibold tracking-tight text-slate-100">
              WFH Monitor
            </h1>
            <p className="text-xs text-slate-400 mt-1 font-medium tracking-wide">
              Sign in to continue
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/10 text-rose-400 text-xs text-center font-medium">
                {error}
              </div>
            )}
            
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider ml-0.5">Username</label>
              <input 
                type="text" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full px-3 py-2 bg-[#111827] border border-white/5 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs text-white placeholder-slate-500 transition-all"
                placeholder="Enter your username"
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider ml-0.5">Password</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2 bg-[#111827] border border-white/5 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs text-white placeholder-slate-500 transition-all"
                placeholder="Enter your password"
              />
            </div>

            <button 
              type="submit"
              disabled={isLoading}
              className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-all text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer mt-2"
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  Signing In...
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}
