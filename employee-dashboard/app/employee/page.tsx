"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import {
  PieChart, Pie, Cell, Tooltip as RechartsTooltip, Legend,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer
} from 'recharts';
import {
  Clock, Activity, Target, Laptop, CalendarDays, Brain,
  Flame, Award, Layers, HelpCircle, ShieldAlert, Sparkles
} from 'lucide-react';
import { classifyActivityWithAI, PRODUCTIVITY_COLORS, FALLBACK_ROLES } from "../../lib/classifier";
import { calculateSessionMetrics } from "../../lib/sessionEngine";
import Dropdown from "../components/Dropdown";

export default function EmployeeDashboard() {
  const router = useRouter();
  const [employeeName, setEmployeeName] = useState<string | null>(null);
  const [roleName, setRoleName] = useState<string>("role_1");
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<"daily" | "weekly" | "monthly" | "all">("daily");
  const [userStatus, setUserStatus] = useState<string>("online");

  const statusOptions = useMemo(() => [
    { value: "online", label: "Online" },
    { value: "dnd", label: "DND (Do Not Disturb)" },
    { value: "idle", label: "Idle" },
    { value: "offline", label: "Offline" }
  ], []);

  const timeFilterOptions = useMemo(() => [
    { value: "daily", label: "Today" },
    { value: "weekly", label: "This Week" },
    { value: "monthly", label: "This Month" },
    { value: "all", label: "All Time" }
  ], []);

  useEffect(() => {
    const role = localStorage.getItem("userRole");
    const name = localStorage.getItem("userName");

    if (role !== "employee" || !name) {
      router.push("/");
    } else {
      setEmployeeName(name);
      fetchEmployeeRole(name);
      const localStatus = localStorage.getItem("userStatus") || "online";
      setUserStatus(localStatus);
    }
  }, [router]);

  useEffect(() => {
    if (employeeName) {
      fetchActivityLogs(employeeName, timeFilter);
    }
  }, [employeeName, timeFilter]);

  const handleStatusChange = async (newStatus: string) => {
    setUserStatus(newStatus);
    localStorage.setItem("userStatus", newStatus);
    const name = employeeName || localStorage.getItem("userName");
    if (!name) return;

    try {
      await supabase.from("activity_logs").insert([{
        employee_name: name,
        app_name: `STATUS_CHANGE | ${newStatus}`,
        website: "status",
        start_time: new Date().toISOString(),
        end_time: new Date().toISOString(),
        duration_seconds: 0,
        category: "Neutral",
        productivity_score: 0
      }]);
    } catch (err) {
      console.warn("Could not sync status change log to Supabase.", err);
    }
  };

  const fetchEmployeeRole = async (name: string) => {
    try {
      const { data: userData } = await supabase
        .from("users")
        .select("id")
        .eq("username", name)
        .single();
      if (userData) {
        const { data: roleData } = await supabase
          .from("employee_roles")
          .select("role_id, roles(name)")
          .eq("employee_id", userData.id)
          .single();
        if (roleData && (roleData as any).roles) {
          setRoleName((roleData as any).roles.name);
        }
      }
    } catch (e) {
      // Graceful fallback if database schema is not fully migrated
      setRoleName("role_1");
    }
  };

  async function fetchActivityLogs(name: string, filter: "daily" | "weekly" | "monthly" | "all") {
    setIsLoading(true);
    let query = supabase
      .from("activity_logs")
      .select("*")
      .eq("employee_name", name);

    if (filter !== "all") {
      const cutoffDate = new Date();
      if (filter === "daily") {
        cutoffDate.setHours(0, 0, 0, 0); // Start of today in local time
      } else if (filter === "weekly") {
        cutoffDate.setDate(cutoffDate.getDate() - 7);
      } else if (filter === "monthly") {
        cutoffDate.setMonth(cutoffDate.getMonth() - 1);
      }
      query = query.gte("start_time", cutoffDate.toISOString());
    }

    const { data, error } = await query.order("start_time", { ascending: false });

    if (!error && data) {
      setLogs(data);
    }
    setIsLoading(false);
  }

  const handleLogout = () => {
    localStorage.removeItem("userRole");
    localStorage.removeItem("userName");
    router.push("/");
  };

  // ==========================================
  // DATA FILTERING & ANALYSIS
  // ==========================================
  const filteredLogs = logs;

  // Sort and classify logs chronologically exactly once
  const classifiedLogs = useMemo(() => {
    const sorted = [...filteredLogs].sort(
      (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );

    return sorted.map((log, index) => {
      // Build context history using the correct sliding window of the chronologically ordered logs
      const contextHistory = sorted.slice(Math.max(0, index - 4), index).map(l => ({
        app_name: l.app_name,
        website: l.website,
        timestamp: l.start_time
      }));

      const ai = classifyActivityWithAI(
        log.app_name,
        log.website,
        log.category || "Neutral",
        roleName,
        log.duration_seconds || 0,
        contextHistory
      );

      return {
        ...log,
        ai
      };
    });
  }, [filteredLogs, roleName]);

  const totalDuration = useMemo(() => {
    return classifiedLogs
      .filter(l => !l.app_name?.startsWith("STATUS_CHANGE"))
      .reduce((sum, log) => sum + (log.duration_seconds || 0), 0);
  }, [classifiedLogs]);

  const productivityRate = useMemo(() => {
    let productive = 0;
    let total = 0;
    classifiedLogs
      .filter(l => !l.app_name?.startsWith("STATUS_CHANGE"))
      .forEach(log => {
        const duration = log.duration_seconds || 0;
        if (log.ai.category === "Productive") {
          productive += duration;
        }
        total += duration;
      });
    return total > 0 ? Math.round((productive / total) * 100) : 0;
  }, [classifiedLogs]);

  // Dynamic Session Metrics Computation
  const metrics = useMemo(() => {
    return calculateSessionMetrics(classifiedLogs, roleName);
  }, [classifiedLogs, roleName]);

  const productivityData = useMemo(() => {
    let productive = 0;
    let unproductive = 0;
    let idle = 0;
    let neutral = 0;

    classifiedLogs.forEach(log => {
      const duration = log.duration_seconds || 0;
      const cat = log.ai.category;

      if (cat === "Idle") {
        idle += duration;
      } else if (cat === "Productive") {
        productive += duration;
      } else if (cat === "Unproductive") {
        unproductive += duration;
      } else {
        neutral += duration;
      }
    });

    const total = productive + unproductive + idle + neutral;
    if (total === 0) return [];

    return [
      { name: 'Productive', value: Math.round((productive / total) * 100), raw: productive },
      { name: 'Unproductive', value: Math.round((unproductive / total) * 100), raw: unproductive },
      { name: 'Neutral', value: Math.round((neutral / total) * 100), raw: neutral },
      { name: 'Idle', value: Math.round((idle / total) * 100), raw: idle },
    ].filter(d => d.value > 0);
  }, [classifiedLogs]);

  const topApps = useMemo(() => {
    const appMap: Record<string, { duration: number, category: string }> = {};
    classifiedLogs.forEach(log => {
      const appName = log.ai.cleanName;
      if (!appMap[appName]) {
        appMap[appName] = { duration: 0, category: log.ai.category };
      }
      appMap[appName].duration += (log.duration_seconds || 0);
    });

    return Object.entries(appMap)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 5); // Top 5
  }, [classifiedLogs]);

  const hourlyProductivity = useMemo(() => {
    const hoursMap: Record<string, number> = {};

    // Initialize 24 hours
    for (let i = 0; i < 24; i++) {
      hoursMap[`${i.toString().padStart(2, '0')}:00`] = 0;
    }

    classifiedLogs.forEach(log => {
      if (log.ai.category === "Productive") {
        const date = new Date(log.start_time);
        const hourKey = `${date.getHours().toString().padStart(2, '0')}:00`;
        hoursMap[hourKey] += (log.ai.score || 0);
      }
    });

    return Object.entries(hoursMap)
      .map(([time, score]) => ({ time, score }))
      .filter(item => item.score > 0 || parseInt(item.time.split(':')[0]) > 6 && parseInt(item.time.split(':')[0]) < 20)
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [classifiedLogs]);

  // Hourly Productivity Heatmap state
  const heatmapData = useMemo(() => {
    const hourlyIntensity: Record<number, { score: number; count: number }> = {};
    for (let i = 9; i <= 18; i++) {
      hourlyIntensity[i] = { score: 0, count: 0 };
    }

    classifiedLogs.forEach(log => {
      const date = new Date(log.start_time);
      const hour = date.getHours();
      if (hour >= 9 && hour <= 18) {
        hourlyIntensity[hour].score += log.ai.score;
        hourlyIntensity[hour].count++;
      }
    });

    return Object.entries(hourlyIntensity).map(([hour, val]) => {
      const avg = val.count > 0 ? val.score / val.count : 0;
      let colorClass = "bg-slate-800/40 border-white/5";
      if (val.count > 0) {
        if (avg > 6) colorClass = "bg-emerald-500/25 border-emerald-500/20 text-emerald-400 glow-sm";
        else if (avg > 2) colorClass = "bg-indigo-500/20 border-indigo-500/10 text-indigo-400";
        else if (avg >= 0) colorClass = "bg-slate-700/30 border-white/10 text-slate-400";
        else colorClass = "bg-rose-500/25 border-rose-500/20 text-rose-400";
      }
      return {
        hour: parseInt(hour),
        label: `${parseInt(hour) % 12 === 0 ? 12 : parseInt(hour) % 12} ${parseInt(hour) >= 12 ? 'PM' : 'AM'}`,
        avg,
        count: val.count,
        colorClass
      };
    });
  }, [classifiedLogs]);

  // Format helper
  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}m`;
    return `${m}m`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Brain className="w-12 h-12 text-indigo-400 animate-pulse" />
        <div className="text-white font-medium tracking-wide">Loading Dashboard Data...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-12 font-sans selection:bg-indigo-500/30 overflow-x-hidden relative">
      {/* Dynamic glow overlays */}
      <div className="fixed inset-0 bg-slate-950 bg-[radial-gradient(circle_at_top_right,_rgba(99,102,241,0.06),_transparent_45%),_radial-gradient(circle_at_bottom_left,_rgba(168,85,247,0.05),_transparent_45%)] -z-10" />

      <div className="max-w-7xl mx-auto space-y-8 relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-1000 ease-out">


        {/* HEADER */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-white/5 pb-6">
          <div>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 text-transparent bg-clip-text drop-shadow-sm pb-1 flex items-center gap-3">
              <Laptop className="w-10 h-10 text-indigo-400" /> Employee Dashboard
            </h1>
            <p className="text-slate-400 mt-2 text-lg font-medium tracking-wide">
              Welcome back, {employeeName}
            </p>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            {/* STATUS SELECTOR */}
            <div className="flex items-center gap-2 bg-slate-900/90 border border-white/10 rounded-xl px-2 py-0.5 flex-shrink-0">
              <span className={`w-2.5 h-2.5 rounded-full ml-3 ${
                userStatus === "online" ? "bg-emerald-500" :
                userStatus === "dnd" ? "bg-rose-500 animate-pulse" :
                userStatus === "idle" ? "bg-amber-500" :
                "bg-slate-500"
              }`} />
              <Dropdown
                options={statusOptions}
                value={userStatus}
                onChange={handleStatusChange}
                className="!bg-transparent border-none !px-0"
              />
            </div>

            {/* TIME FILTER */}
            <Dropdown
              options={timeFilterOptions}
              value={timeFilter}
              onChange={(val) => setTimeFilter(val as any)}
              icon={CalendarDays}
            />

            <button
              onClick={handleLogout}
              className="px-5 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-xl transition-all text-sm font-semibold tracking-wide"
            >
              Logout
            </button>
          </div>
        </header>

        {/* METRICS OVERVIEW */}
        {filteredLogs.length === 0 ? (
          <div className="text-center py-20 bg-slate-900 border border-white/5 rounded-3xl">
            <Activity className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-slate-300">No logs cached</h2>
             <p className="text-slate-500 mt-2">Activity tracking is active. Work to capture analytics.</p>
          </div>
        ) : (
          <div className="space-y-6">

            {/* SIMPLIFIED METRICS ROW */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

              {/* Active Time */}
              <div className="relative group overflow-hidden bg-slate-900/95 border border-white/10 rounded-3xl p-6 flex flex-col justify-between h-[160px]">
                <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-xl -mr-6 -mt-6"></div>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Active Time</p>
                    <h3 className="text-3xl font-extrabold mt-2 text-white bg-gradient-to-r from-indigo-400 to-indigo-200 bg-clip-text text-transparent">{formatDuration(totalDuration)}</h3>
                  </div>
                  <div className="p-3 bg-indigo-500/10 rounded-2xl border border-indigo-500/20">
                    <Clock className="w-6 h-6 text-indigo-400" />
                  </div>
                </div>
                <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></span>
                  <span>Active WFH time logged</span>
                </div>
              </div>

              {/* Productivity Rate */}
              <div className="relative group overflow-hidden bg-slate-900/95 border border-white/10 rounded-3xl p-6 flex flex-col justify-between h-[160px]">
                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl -mr-6 -mt-6"></div>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Productivity Rate</p>
                    <h3 className="text-3xl font-extrabold mt-2 text-white bg-gradient-to-r from-emerald-400 to-emerald-200 bg-clip-text text-transparent">{productivityRate}%</h3>
                  </div>
                  <div className="p-3 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
                    <Target className="w-6 h-6 text-emerald-400" />
                  </div>
                </div>
                <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-2">
                  <span className={`w-2 h-2 rounded-full ${productivityRate >= 70 ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                  <span>{productivityRate >= 70 ? 'Highly productive output' : 'Needs attention'}</span>
                </div>
              </div>

              {/* Corporate Role */}
              <div className="relative group overflow-hidden bg-slate-900/95 border border-white/10 rounded-3xl p-6 flex flex-col justify-between h-[160px]">
                <div className="absolute top-0 right-0 w-24 h-24 bg-pink-500/5 rounded-full blur-xl -mr-6 -mt-6"></div>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Your Role</p>
                    <h3 className="text-2xl font-extrabold mt-2 text-white bg-gradient-to-br from-white to-slate-400 bg-clip-text text-transparent capitalize leading-tight">
                      {FALLBACK_ROLES[roleName]?.name || roleName.replace("_", " ")}
                    </h3>
                  </div>
                  <div className="p-3 bg-pink-500/10 rounded-2xl border border-pink-500/20">
                    <Laptop className="w-6 h-6 text-pink-400" />
                  </div>
                </div>
                <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-pink-400"></span>
                  <span>Scoring configured for role</span>
                </div>
              </div>

              {/* Account Status */}
              <div className="relative group overflow-hidden bg-slate-900/95 border border-white/10 rounded-3xl p-6 flex flex-col justify-between h-[160px]">
                <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-xl -mr-6 -mt-6"></div>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Active Status</p>
                    <h3 className="text-2xl font-extrabold mt-2 text-white bg-gradient-to-r from-amber-400 to-amber-200 bg-clip-text text-transparent capitalize">
                      {userStatus === "dnd" ? "DND" : userStatus}
                    </h3>
                  </div>
                  <div className="p-3 bg-amber-500/10 rounded-2xl border border-amber-500/20">
                    <span className={`w-3.5 h-3.5 rounded-full ${
                      userStatus === "online" ? "bg-emerald-500" :
                      userStatus === "dnd" ? "bg-rose-500 animate-pulse" :
                      userStatus === "idle" ? "bg-amber-500" :
                      "bg-slate-500"
                    }`} />
                  </div>
                </div>
                <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                  <span>Visible to team admin</span>
                </div>
              </div>

            </div>

            {/* PRODUCTIVITY CHARTS & INTERACTIVE GRID */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* Breakdown Pie Chart */}
              <div className="relative group col-span-1">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 rounded-[2rem] blur opacity-25"></div>
                <div className="relative bg-slate-900/95 border border-white/10 rounded-[2rem] p-6 h-full flex flex-col justify-between">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-emerald-500/20 rounded-xl">
                      <Target className="w-5 h-5 text-emerald-400" />
                    </div>
                    <h2 className="text-lg font-bold text-slate-200">Productivity Distribution</h2>
                  </div>

                  <div className="flex-1 min-h-[240px] flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={productivityData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                          stroke="none"
                          label={({ name, percent }: any) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                          labelLine={false}
                        >
                          {productivityData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={PRODUCTIVITY_COLORS[entry.name as keyof typeof PRODUCTIVITY_COLORS]} />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px' }}
                          itemStyle={{ color: '#f8fafc' }}
                          formatter={(value: any, name: any, props: any) => [`${formatDuration(props.payload.raw)}`, name]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Peak Productivity Area Curve */}
              <div className="relative group col-span-1 lg:col-span-2">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 rounded-[2rem] blur opacity-25"></div>
                <div className="relative bg-slate-900/95 border border-white/10 rounded-[2rem] p-6 h-full flex flex-col justify-between">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-indigo-500/20 rounded-xl">
                      <Clock className="w-5 h-5 text-indigo-400" />
                    </div>
                     <h2 className="text-lg font-bold text-slate-200">Hourly Productivity Trend</h2>
                  </div>

                  <div className="flex-1 min-h-[240px] -ml-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={hourlyProductivity}>
                        <defs>
                          <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#818cf8" stopOpacity={0.8} />
                            <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                        <XAxis dataKey="time" stroke="#64748b" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
                        <YAxis stroke="#64748b" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
                        <RechartsTooltip
                          contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px' }}
                          itemStyle={{ color: '#818cf8', fontWeight: 'bold' }}
                          labelStyle={{ color: '#cbd5e1', marginBottom: '4px' }}
                        />
                        <Area type="monotone" dataKey="score" stroke="#818cf8" strokeWidth={3} fillOpacity={1} fill="url(#colorScore)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

            </div>

            {/* HOURLY HEATMAP GRID */}
            <div className="grid grid-cols-1 gap-6">

              {/* Hourly Intensity Grid */}
              <div className="relative group overflow-hidden bg-slate-900/95 border border-white/10 rounded-[2rem] p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-500/20 rounded-xl">
                      <Activity className="w-5 h-5 text-indigo-400" />
                    </div>
                    <h2 className="text-lg font-bold text-slate-200">Hourly Productivity Heatmap</h2>
                  </div>
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Office Hours (9AM - 6PM)</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 md:grid-cols-10 gap-3">
                  {heatmapData.map((cell) => (
                    <div
                      key={cell.hour}
                      className={`flex flex-col items-center justify-between p-3.5 rounded-2xl border text-center transition-all duration-300 hover:scale-105 ${cell.colorClass}`}
                    >
                      <span className="text-xs font-semibold text-slate-400">{cell.label}</span>
                      <span className="text-lg font-black mt-2">
                        {cell.count > 0 ? (cell.avg > 0 ? `+${cell.avg.toFixed(0)}` : cell.avg.toFixed(0)) : "—"}
                      </span>
                      <span className="text-[9px] text-slate-500 font-medium mt-1">
                        {cell.count} {cell.count === 1 ? 'activity' : 'activities'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* MOST USED APPS LIST & RULES DICTIONARY */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* Top Apps List */}
              <div className="relative group col-span-1 lg:col-span-3">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-slate-600/20 to-slate-500/20 rounded-[2rem] blur opacity-25"></div>
                <div className="relative bg-slate-900/95 border border-white/10 rounded-[2rem] p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-slate-800 rounded-xl border border-white/5">
                      <Laptop className="w-5 h-5 text-slate-300" />
                    </div>
                     <h2 className="text-lg font-bold text-slate-200">Most Used Apps</h2>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    {topApps.map((app, index) => (
                      <div key={app.name} className="bg-slate-800/50 border border-white/5 rounded-2xl p-4 hover:bg-slate-800 transition-colors">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-xs font-bold text-slate-500 bg-slate-900 px-2 py-1 rounded-md">#{index + 1}</span>
                          <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider
                            ${app.category === 'Productive' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                              app.category === 'Idle' ? 'bg-slate-500/10 text-slate-400 border border-slate-500/20' :
                                app.category === 'Unproductive' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                                  'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'}`}
                          >
                            {app.category}
                          </span>
                        </div>
                        <h3 className="font-semibold text-slate-200 truncate mt-1 text-sm" title={app.name}>{app.name}</h3>
                        <p className="text-xl font-black text-white mt-3 bg-gradient-to-br from-white to-slate-400 bg-clip-text text-transparent">
                          {formatDuration(app.duration)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

            </div>

          </div>
        )}
      </div>
    </div>
  );
}
