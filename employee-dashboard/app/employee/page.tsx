"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import {
  PieChart, Pie, Cell, Tooltip as RechartsTooltip, Legend,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer
} from 'recharts';
import {
  Clock, Activity, Target, Laptop, CalendarDays,
  Flame, Award, Layers, HelpCircle, ShieldAlert, Sparkles
} from 'lucide-react';
import { classifyActivityWithAI, PRODUCTIVITY_COLORS, FALLBACK_ROLES } from "../../lib/classifier";
import { calculateSessionMetrics } from "../../lib/sessionEngine";
import Dropdown from "../components/Dropdown";

// ==========================================
// HELPERS & CUSTOM COMPONENTS
// ==========================================
const formatDuration = (seconds: number) => {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#121826] border border-white/5 rounded-lg p-3.5 shadow-lg text-xs backdrop-blur-md">
      {label && <p className="text-slate-400 mb-1.5 font-bold uppercase tracking-wider">{label}</p>}
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2 mt-1">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color || entry.fill }} />
          <span className="text-slate-400 font-medium">{entry.name}:</span>
          <span className="font-semibold text-slate-100">
            {typeof entry.value === "number" && entry.payload?.raw !== undefined
              ? formatDuration(entry.payload.raw)
              : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
};

export default function EmployeeDashboard() {
  const router = useRouter();
  const [employeeName, setEmployeeName] = useState<string | null>(null);
  const [roleName, setRoleName] = useState<string>("role_1");
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<"daily" | "weekly" | "monthly" | "all">("daily");
  const [userStatus, setUserStatus] = useState<string>("online");
  // New search and designation filter state for activity logs
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [designationFilter, setDesignationFilter] = useState<string>("All");
  // Employee directory state
  const [employees, setEmployees] = useState<any[]>([]);
  const [empLoading, setEmpLoading] = useState(true);



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

  // Designation options derived from employee directory
const designationOptions = useMemo(() => {
  const set = new Set<string>();
  employees.forEach(e => {
    if (e.designation) set.add(e.designation);
  });
  const opts = Array.from(set).map(d => ({ value: d, label: d }));
  return [{ value: "All", label: "All" }, ...opts];
}, [employees]);

  useEffect(() => {
    const role = localStorage.getItem("userRole");
    const name = localStorage.getItem("userName");
    // New function to fetch list of all employees for directory
    const fetchEmployeeDirectory = async () => {
      setEmpLoading(true);
      try {
        // Assuming a 'users' table with 'id', 'username', and a related 'designation' field
        const { data, error } = await supabase
          .from('users')
          .select('id, username, designation');
        if (!error && data) {
          setEmployees(data);
        } else {
          console.warn('Failed to fetch employee directory', error);
          setEmployees([]);
        }
      } catch (e) {
        console.error('Error fetching employee directory', e);
        setEmployees([]);
      }
      setEmpLoading(false);
    };
    // Fetch employee directory once on mount
    fetchEmployeeDirectory();

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
      // No changes needed here

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
  const filteredLogs = useMemo(() => {
    let data = logs;
    if (searchTerm) {
      data = data.filter(l => (l.employee_name || "").toLowerCase().includes(searchTerm.toLowerCase()));
    }
    if (designationFilter && designationFilter !== "All") {
      data = data.filter(l => (l.designation || "").toLowerCase() === designationFilter.toLowerCase());
    }
    return data.sort((a, b) => (a.employee_name || "").localeCompare(b.employee_name || ""));
  }, [logs, searchTerm, designationFilter]);
  const filteredEmployees = useMemo(() => {
    let data = employees;
    if (searchTerm) {
      data = data.filter(e => (e.username || "").toLowerCase().includes(searchTerm.toLowerCase()));
    }
    if (designationFilter && designationFilter !== "All") {
      data = data.filter(e => (e.designation || "").toLowerCase() === designationFilter.toLowerCase());
    }
    return data.sort((a, b) => (a.username || "").localeCompare(b.username || ""));
  }, [employees, searchTerm, designationFilter]);

  const matchingEmployees = useMemo(() => {
    if (!searchTerm) return [];
    return employees.filter(e => 
      (e.username || "").toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [employees, searchTerm]);

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



  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0B1020] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-white/10 border-t-blue-500 rounded-full animate-spin"></div>
          <div className="text-slate-400 text-xs font-medium tracking-wide mt-1">Loading dashboard...</div>
        </div>
      </div>
    );
  }

  if (empLoading) {
    return (
      <div className="min-h-screen bg-[#0B1020] flex items-center justify-center">
        <div className="text-slate-400">Loading employee directory...</div>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-[#0B1020] text-slate-100 p-6 md:p-8 font-sans selection:bg-blue-500/30 overflow-x-hidden relative">
      <div className="fixed inset-0 bg-[#0B1020] -z-10" />

      <div className="max-w-7xl mx-auto space-y-6 relative z-10">

        {/* HEADER */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-white/5 pb-5 relative z-30">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-100 flex items-center gap-2">
              <Laptop className="w-7 h-7 text-blue-500" /> Employee Dashboard
            </h1>
            <p className="text-xs text-slate-400 mt-1 font-medium tracking-wide">
              Welcome back, {employeeName}
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">

            {/* DESIGNATION FILTER */}
            <Dropdown
              options={designationOptions}
              value={designationFilter}
              onChange={(val) => setDesignationFilter(val as any)}
              className="!bg-transparent border-none"
            />
            {/* STATUS SELECTOR */}
            <div className="flex items-center gap-2 bg-[#121826] border border-white/5 rounded-xl px-2.5 py-0.5 flex-shrink-0">
              <span className={`w-2 h-2 rounded-full ml-1 ${
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
              className="px-4 py-2 bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-500/10 rounded-lg transition-all text-xs font-medium cursor-pointer"
            >
              Logout
            </button>
          </div>
        </header>
        {/* EMPLOYEE DIRECTORY */}
        <div className="my-6">
          <h2 className="text-lg font-semibold text-slate-200 mb-3">Employee Directory</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {filteredEmployees.map(emp => (
              <div key={emp.id} className="bg-[#121826] border border-white/5 rounded-[14px] p-4 flex items-center gap-3 hover:border-white/10 transition-all">
                <span className="text-slate-200 font-medium">{emp.username}</span>
                <span className="text-xs text-slate-400">{emp.designation || 'No Role'}</span>
              </div>
            ))}
          </div>
        </div>

        {/* METRICS OVERVIEW */}
        {filteredLogs.length === 0 ? (
          <div className="text-center py-16 bg-[#121826] border border-white/5 rounded-[14px] shadow-sm">
            <Activity className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <h2 className="text-base font-semibold text-slate-300">No activity logs recorded</h2>
            <p className="text-xs text-slate-500 mt-1">Activity tracking is active. Start working to capture analytics.</p>
          </div>
        ) : (
          <div className="space-y-6">

            {/* SIMPLIFIED METRICS ROW */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

              {/* Active Time */}
              <div className="relative bg-[#121826] border border-white/5 rounded-[14px] p-5 flex items-center justify-between shadow-sm hover:border-white/10 transition-all">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Active Time</p>
                  <h3 className="text-2xl font-semibold text-slate-100 tracking-tight mt-1">{formatDuration(totalDuration)}</h3>
                </div>
                <div className="p-2.5 rounded-lg bg-[#111827] border border-white/5 shrink-0">
                  <Clock className="w-5 h-5 text-blue-500" />
                </div>
              </div>

              {/* Productivity Rate */}
              <div className="relative bg-[#121826] border border-white/5 rounded-[14px] p-5 flex items-center justify-between shadow-sm hover:border-white/10 transition-all">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Productivity Rate</p>
                  <h3 className="text-2xl font-semibold text-slate-100 tracking-tight mt-1">{productivityRate}%</h3>
                </div>
                <div className="p-2.5 rounded-lg bg-[#111827] border border-white/5 shrink-0">
                  <Target className="w-5 h-5 text-emerald-500" />
                </div>
              </div>

              {/* Corporate Role */}
              <div className="relative bg-[#121826] border border-white/5 rounded-[14px] p-5 flex items-center justify-between shadow-sm hover:border-white/10 transition-all">
                <div className="min-w-0 flex-1 mr-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Your Role</p>
                  <h3 className="text-[15px] font-semibold text-slate-100 tracking-tight mt-1.5 capitalize truncate">
                    {FALLBACK_ROLES[roleName]?.name || roleName.replace("_", " ")}
                  </h3>
                </div>
                <div className="p-2.5 rounded-lg bg-[#111827] border border-white/5 shrink-0">
                  <Laptop className="w-5 h-5 text-blue-400" />
                </div>
              </div>

              {/* Account Status */}
              <div className="relative bg-[#121826] border border-white/5 rounded-[14px] p-5 flex items-center justify-between shadow-sm hover:border-white/10 transition-all">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Active Status</p>
                  <h3 className="text-2xl font-semibold text-slate-100 tracking-tight mt-1 capitalize">
                    {userStatus === "dnd" ? "DND" : userStatus}
                  </h3>
                </div>
                <div className="p-2.5 rounded-lg bg-[#111827] border border-white/5 shrink-0">
                  <span className={`w-2.5 h-2.5 rounded-full block ${
                    userStatus === "online" ? "bg-emerald-500" :
                    userStatus === "dnd" ? "bg-rose-500 animate-pulse" :
                    userStatus === "idle" ? "bg-amber-500" :
                    "bg-slate-500"
                  }`} />
                </div>
              </div>

            </div>

            {/* PRODUCTIVITY CHARTS & INTERACTIVE GRID */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* Breakdown Pie Chart */}
              <div className="relative group col-span-1">
                <div className="relative bg-[#121826] border border-white/5 rounded-[14px] p-5 h-full flex flex-col justify-between shadow-sm">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-[#111827] border border-white/5 rounded-lg">
                      <Target className="w-4 h-4 text-emerald-500" />
                    </div>
                    <h2 className="text-sm font-semibold text-slate-200 tracking-wide">Productivity Distribution</h2>
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
                        <RechartsTooltip content={<CustomTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Peak Productivity Area Curve */}
              <div className="relative group col-span-1 lg:col-span-2">
                <div className="relative bg-[#121826] border border-white/5 rounded-[14px] p-5 h-full flex flex-col justify-between shadow-sm">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-[#111827] border border-white/5 rounded-lg">
                      <Clock className="w-4 h-4 text-blue-500" />
                    </div>
                    <h2 className="text-sm font-semibold text-slate-200 tracking-wide">Hourly Productivity Trend</h2>
                  </div>

                  <div className="flex-1 min-h-[240px] -ml-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={hourlyProductivity}>
                        <defs>
                          <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                        <XAxis dataKey="time" stroke="#475569" tick={{ fill: '#64748b', fontSize: 9 }} tickLine={false} axisLine={false} />
                        <YAxis stroke="#475569" tick={{ fill: '#64748b', fontSize: 9 }} tickLine={false} axisLine={false} />
                        <RechartsTooltip content={<CustomTooltip />} />
                        <Area type="monotone" dataKey="score" stroke="#3B82F6" strokeWidth={2} fillOpacity={1} fill="url(#colorScore)" dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

            </div>

            {/* HOURLY HEATMAP GRID */}
            <div className="grid grid-cols-1 gap-6">

              {/* Hourly Intensity Grid */}
              <div className="relative bg-[#121826] border border-white/5 rounded-[14px] p-5 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-[#111827] border border-white/5 rounded-lg">
                      <Activity className="w-4 h-4 text-blue-500" />
                    </div>
                    <h2 className="text-sm font-semibold text-slate-200 tracking-wide">Hourly Productivity Heatmap</h2>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 md:grid-cols-10 gap-3">
                  {heatmapData.map((cell) => (
                    <div
                      key={cell.hour}
                      className={`flex flex-col items-center justify-between p-3 rounded-xl border text-center transition-all duration-300 hover:scale-[1.02] ${cell.colorClass}`}
                    >
                      <span className="text-[10px] font-medium text-slate-400">{cell.label}</span>
                      <span className="text-base font-semibold text-slate-100 mt-2">
                        {cell.count > 0 ? (cell.avg > 0 ? `+${cell.avg.toFixed(0)}` : cell.avg.toFixed(0)) : "—"}
                      </span>
                      <span className="text-[9px] text-slate-500 font-medium mt-1 font-mono">
                        {cell.count} {cell.count === 1 ? 'act' : 'acts'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* MOST USED APPS LIST & RULES DICTIONARY */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* Top Apps List */}
              <div className="relative col-span-1 lg:col-span-3">
                <div className="relative bg-[#121826] border border-white/5 rounded-[14px] p-5 shadow-sm">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-[#111827] border border-white/5 rounded-lg">
                      <Laptop className="w-4 h-4 text-blue-500" />
                    </div>
                    <h2 className="text-sm font-semibold text-slate-200 tracking-wide">Most Used Apps</h2>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    {topApps.map((app, index) => (
                      <div key={app.name} className="bg-[#111827] border border-white/5 rounded-xl p-4 hover:border-white/10 hover:bg-[#111827]/80 transition-all shadow-sm">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[10px] font-semibold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md">#{index + 1}</span>
                          <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-md uppercase tracking-wider
                            ${app.category === 'Productive' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/10' :
                              app.category === 'Idle' ? 'bg-slate-500/10 text-slate-400 border border-slate-500/10' :
                                app.category === 'Unproductive' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/10' :
                                  'bg-blue-500/10 text-blue-400 border border-blue-500/10'}`}
                          >
                            {app.category}
                          </span>
                        </div>
                        <h3 className="font-medium text-slate-200 truncate mt-1 text-xs" title={app.name}>{app.name}</h3>
                        <p className="text-base font-semibold text-slate-100 mt-2">
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
