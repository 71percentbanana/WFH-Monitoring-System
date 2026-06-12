"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  ReferenceArea, ReferenceLine, Tooltip as ReTooltip
} from 'recharts';
import {
  Clock, Target, Laptop, CalendarDays,
  RefreshCw
} from 'lucide-react';
import { classifyActivityWithAI, PRODUCTIVITY_COLORS, FALLBACK_ROLES, getNormalizedRoleName, DomainRuleInfo } from "../../lib/classifier";
import Dropdown from "../components/Dropdown";
import { fetchGeminiClassification, getGeminiCacheKey, GeminiClassificationResult } from "../../lib/geminiClassifier";

// ==========================================
// HELPERS & CUSTOM COMPONENTS
// ==========================================
const CATEGORY_COLORS: Record<string, string> = PRODUCTIVITY_COLORS;

const formatDuration = (seconds?: number | null): string => {
  if (seconds === null || seconds === undefined || seconds === 0) return "0s";
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
};

// CompactStatWidget renders the metrics cards at the top of the dashboard.
function CompactStatWidget({ label, value, sub, colorClass }: {
  label: string; value: string; sub?: string; colorClass?: string;
}) {
  return (
    <div className="bg-[#121826] border border-slate-800 rounded p-2.5 flex flex-col justify-center min-w-0 shadow-sm hover:bg-[#121826]/80 transition-colors">
      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      <span className={`text-xl font-bold font-mono tracking-tight mt-0.5 ${colorClass || "text-slate-100"}`}>{value}</span>
      {sub && <span className="text-[9px] text-slate-500 font-medium mt-0.5 leading-snug">{sub}</span>}
    </div>
  );
}





const TimelineTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div className="bg-[#121826] border border-slate-800 rounded p-2.5 shadow-lg text-xs font-mono">
      <p className="text-slate-200 font-bold border-b border-slate-800 pb-1 mb-1.5 uppercase text-[10px]">{data.time}</p>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-slate-400">Focus Score:</span>
          <span className="text-blue-400 font-semibold">{data["Focus Score"]}%</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-400">Activity Level:</span>
          <span className="text-emerald-400 font-semibold">{data["Activity Score"]}%</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-400">Productivity:</span>
          <span className="text-indigo-400 font-semibold">{data["Productivity Score"]}%</span>
        </div>
        <div className="border-t border-slate-800 pt-1 mt-1 text-[9px] text-slate-505">
          <span className="block font-semibold uppercase text-[8px] text-slate-400 mb-0.5">Active Apps:</span>
          <span className="block text-slate-300 break-words max-w-[200px] leading-normal">{data["Active Apps"]}</span>
        </div>
      </div>
    </div>
  );
};



// ==========================================
// MAIN DASHBOARD COMPONENT
// ==========================================
export default function EmployeeDashboard() {
  const router = useRouter();
  const [employeeName, setEmployeeName] = useState<string | null>(null);
  const [roleName, setRoleName] = useState<string>("Knowledge Worker");
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<"daily" | "yesterday" | "weekly" | "monthly" | "all" | "custom">("daily");
  const [customDate, setCustomDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [userStatus, setUserStatus] = useState<string>("online");
  const [geminiClassifications, setGeminiClassifications] = useState<Record<string, GeminiClassificationResult>>({});
  const [domainRules, setDomainRules] = useState<Record<string, DomainRuleInfo>>({});

  // Stream UI states
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch domain rules on mount
  useEffect(() => {
    async function loadDomainRules() {
      try {
        const { data: rulesData, error: rulesError } = await supabase
          .from("domain_rules")
          .select("*");
        if (!rulesError && rulesData) {
          const rulesMap: Record<string, DomainRuleInfo> = {};
          rulesData.forEach((r: any) => {
            if (r.domain) {
              const defaultScore = r.type === "whitelist" ? 10 : r.type === "blacklist" ? -10 : 0;
              rulesMap[r.domain.toLowerCase().trim()] = {
                type: r.type,
                score: typeof r.score === "number" ? r.score : defaultScore
              };
            }
          });
          setDomainRules(rulesMap);
        }
      } catch (err) {
        console.error("Failed to fetch domain rules:", err);
      }
    }
    loadDomainRules();
  }, []);



  const timeFilterOptions = useMemo(() => [
    { value: "daily", label: "Today" },
    { value: "yesterday", label: "Yesterday" },
    { value: "weekly", label: "This Week" },
    { value: "monthly", label: "This Month" },
    { value: "custom", label: "Custom Date" },
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
      fetchActivityLogs(employeeName, timeFilter, customDate);
    }
  }, [employeeName, timeFilter, customDate]);

  // Real-Time Postgres listener (zero-polling)
  useEffect(() => {
    if (isLoading || !employeeName) return;

    const channel = supabase
      .channel("activity-channel-employee")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_logs", filter: `employee_name=eq.${employeeName}` }, (payload) => {
        fetchActivityLogs(employeeName, timeFilter, customDate);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isLoading, employeeName, timeFilter, customDate]);

  // Load and fetch Gemini classifications for all unique activities
  useEffect(() => {
    if (!logs.length) return;

    const newClassifications: Record<string, GeminiClassificationResult> = { ...geminiClassifications };
    let stateChanged = false;
    const pendingFetches: Array<{ appName: string; website: string; key: string }> = [];

    logs.forEach(log => {
      if (log.app_name === "IDLE" || log.app_name === "Unknown" || log.app_name?.startsWith("STATUS_CHANGE")) return;

      const cacheKey = getGeminiCacheKey(log.app_name, log.website, roleName);
      if (newClassifications[cacheKey]) return;

      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          newClassifications[cacheKey] = JSON.parse(cached);
          stateChanged = true;
        } catch (e) {
          localStorage.removeItem(cacheKey);
        }
      } else {
        pendingFetches.push({ appName: log.app_name, website: log.website, key: cacheKey });
      }
    });

    if (stateChanged) {
      setGeminiClassifications(newClassifications);
    }

    if (pendingFetches.length > 0) {
      const fetchAll = async () => {
        for (const item of pendingFetches) {
          const result = await fetchGeminiClassification(item.appName, item.website, roleName);
          if (result) {
            localStorage.setItem(item.key, JSON.stringify(result));
            setGeminiClassifications(prev => ({ ...prev, [item.key]: result }));
          }
        }
      };
      fetchAll();
    }
  }, [logs, roleName]);





  const fetchEmployeeRole = async (name: string) => {
    try {
      const { data: empData } = await supabase
        .from("employees")
        .select("department")
        .eq("name", name)
        .single();
      if (empData && empData.department) {
        setRoleName(getNormalizedRoleName(empData.department));
      } else {
        setRoleName("Knowledge Worker");
      }
    } catch {
      setRoleName("Knowledge Worker");
    }
  };

  async function fetchActivityLogs(name: string, filter: string, targetDateStr?: string) {
    setIsLoading(true);
    let query = supabase
      .from("activity_logs")
      .select("*")
      .eq("employee_name", name);

    if (filter === "custom" && targetDateStr) {
      const [year, month, day] = targetDateStr.split("-").map(Number);
      const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
      const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);

      query = query
        .gte("start_time", startOfDay.toISOString())
        .lte("start_time", endOfDay.toISOString());
    } else if (filter === "yesterday") {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const startOfYesterday = new Date(startOfToday);
      startOfYesterday.setDate(startOfYesterday.getDate() - 1);

      query = query
        .gte("start_time", startOfYesterday.toISOString())
        .lt("start_time", startOfToday.toISOString());
    } else if (filter === "weekly") {
      const today = new Date();
      const dayOfWeek = today.getDay();
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - dayOfWeek);
      startOfWeek.setHours(0, 0, 0, 0);

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);

      query = query
        .gte("start_time", startOfWeek.toISOString())
        .lte("start_time", endOfWeek.toISOString());
    } else if (filter === "monthly") {
      const today = new Date();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0);
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);

      query = query
        .gte("start_time", startOfMonth.toISOString())
        .lte("start_time", endOfMonth.toISOString());
    } else if (filter === "daily") {
      const cutoffDate = new Date();
      cutoffDate.setHours(0, 0, 0, 0);
      query = query.gte("start_time", cutoffDate.toISOString());
    }

    const { data, error } = await query
      .order("start_time", { ascending: false })
      .limit(500);

    if (!error && data) {
      setLogs(data);
    }
    setIsLoading(false);
  }

  const handleRefresh = async () => {
    if (!employeeName) return;
    setIsRefreshing(true);
    try {
      await fetchActivityLogs(employeeName, timeFilter, customDate);
    } catch (err) {
      console.error(err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("userRole");
    localStorage.removeItem("userName");
    router.push("/");
  };



  // Sort and classify logs chronologically exactly once
  const classifiedLogs = useMemo(() => {
    const sorted = [...logs].sort(
      (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );

    return sorted.map((log, index) => {
      const contextHistory = sorted.slice(Math.max(0, index - 4), index).map(l => ({
        app_name: l.app_name,
        website: l.website,
        timestamp: l.start_time
      }));

      const cacheKey = getGeminiCacheKey(log.app_name, log.website, roleName);
      const geminiCls = geminiClassifications[cacheKey] || null;

      const ai = classifyActivityWithAI(
        log.app_name,
        log.website,
        log.category || "Neutral",
        roleName,
        log.duration_seconds || 0,
        contextHistory,
        geminiCls,
        domainRules
      );

      return {
        ...log,
        ai
      };
    });
  }, [logs, roleName, geminiClassifications, domainRules]);

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
        const cat = log.ai.category;
        if (cat !== "Idle") {
          if (cat === "Productive" || cat === "Neutral") {
            productive += duration;
          }
          total += duration;
        }
      });
    return total > 0 ? Math.round((productive / total) * 100) : 0;
  }, [classifiedLogs]);

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



  // Hourly focus and trend data formatted for Recharts
  const hourlyFocusTrend = useMemo(() => {
    const hoursMap: Record<number, { 
      activeDuration: number; 
      productiveDuration: number;
      scoreSum: number;
      scoreCount: number;
      apps: Set<string>;
    }> = {};
    
    for (let i = 0; i <= 23; i++) {
      hoursMap[i] = {
        activeDuration: 0,
        productiveDuration: 0,
        scoreSum: 0,
        scoreCount: 0,
        apps: new Set<string>()
      };
    }

    classifiedLogs.forEach(a => {
      if (!a.start_time) return;
      const date = new Date(a.start_time);
      const hour = date.getHours();
      if (hour >= 0 && hour <= 23) {
        const duration = a.duration_seconds || 0;
        const cat = a.ai.category;
        const app = a.ai.cleanName;
        
        if (cat !== "Idle" && !a.app_name?.startsWith("STATUS_CHANGE")) {
          hoursMap[hour].activeDuration += duration;
          if (cat === "Productive" || cat === "Neutral") {
            hoursMap[hour].productiveDuration += duration;
          }
          hoursMap[hour].scoreSum += a.ai.score;
          hoursMap[hour].scoreCount++;
          if (app && app !== "Unknown" && app !== "Web Browser") {
            hoursMap[hour].apps.add(app);
          }
        }
      }
    });

    return Object.entries(hoursMap).map(([hourStr, val]) => {
      const hour = parseInt(hourStr);
      const period = hour >= 12 ? "PM" : "AM";
      const formatHour = hour % 12 === 0 ? 12 : hour % 12;
      const timeLabel = `${formatHour} ${period}`;
      
      const focusScore = val.scoreCount > 0 
        ? Math.max(0, Math.min(100, Math.round(((val.scoreSum / val.scoreCount) + 10) * 5))) 
        : 0;
        
      const activityScore = Math.min(100, Math.round((val.activeDuration / 3600) * 100));
      
      const productivityScore = val.activeDuration > 0 
        ? Math.round((val.productiveDuration / val.activeDuration) * 100) 
        : 0;
        
      const activeAppsList = Array.from(val.apps).slice(0, 3);
      const activeAppsStr = activeAppsList.length > 0 ? activeAppsList.join(", ") : "None";

      const endHour = (hour + 1) % 24;
      const endPeriod = endHour >= 12 ? "PM" : "AM";
      const formatEnd = endHour % 12 === 0 ? 12 : endHour % 12;
      const slotLabel = `${timeLabel} - ${formatEnd} ${endPeriod}`;

      return {
        time: timeLabel,
        slot: slotLabel,
        hour: hour,
        "Focus Score": focusScore,
        "Activity Score": activityScore,
        "Productivity Score": productivityScore,
        "Active Apps": activeAppsStr,
        productiveDuration: val.productiveDuration
      };
    });
  }, [classifiedLogs]);

  const totalIdleTime = useMemo(() => {
    return classifiedLogs
      .filter(a => a.ai.category === "Idle")
      .reduce((sum, a) => sum + (a.duration_seconds || 0), 0);
  }, [classifiedLogs]);

  const totalDailyTime = useMemo(() => {
    return classifiedLogs.reduce((sum, a) => sum + (a.duration_seconds || 0), 0);
  }, [classifiedLogs]);

  const totalNonIdleTime = useMemo(() => {
    return classifiedLogs
      .filter(a => a.ai.category !== "Idle")
      .reduce((sum, a) => sum + (a.duration_seconds || 0), 0);
  }, [classifiedLogs]);

  const longestIdlePeriod = useMemo(() => {
    const idleLogs = classifiedLogs.filter(a => a.ai.category === "Idle");
    if (idleLogs.length === 0) return 0;
    return Math.max(...idleLogs.map(l => l.duration_seconds || 0));
  }, [classifiedLogs]);

  const timelineSummaryStats = useMemo(() => {
    const activeHours = hourlyFocusTrend.filter(h => h["Activity Score"] > 0 || h["Focus Score"] > 0);
    const avgFocus = activeHours.length > 0 
      ? Math.round(activeHours.reduce((sum, h) => sum + h["Focus Score"], 0) / activeHours.length)
      : 0;

    // Find peak focus hour based on highest productive duration in a one hour slot
    let peakHourObj = { slot: "—", productiveDuration: -1 };
    hourlyFocusTrend.forEach(h => {
      if ((h as any).productiveDuration > peakHourObj.productiveDuration && (h as any).productiveDuration > 0) {
        peakHourObj = { slot: (h as any).slot, productiveDuration: (h as any).productiveDuration };
      }
    });

    const peakFocusTime = peakHourObj.productiveDuration > 0 ? peakHourObj.slot : "—";
    
    return {
      avgFocus,
      peakFocusTime
    };
  }, [hourlyFocusTrend]);

  const distributionStats = useMemo(() => {
    let productive = 0;
    let neutral = 0;
    let unproductive = 0;
    let idle = 0;

    classifiedLogs.forEach(a => {
      if (a.app_name?.startsWith("STATUS_CHANGE")) return;
      const duration = a.duration_seconds || 0;
      const cat = a.ai.category;
      if (cat === "Productive") productive += duration;
      else if (cat === "Neutral") neutral += duration;
      else if (cat === "Unproductive") unproductive += duration;
      else if (cat === "Idle") idle += duration;
    });

    const total = productive + neutral + unproductive + idle;
    
    return {
      productive: { duration: productive, pct: total > 0 ? Math.round((productive / total) * 100) : 0 },
      neutral: { duration: neutral, pct: total > 0 ? Math.round((neutral / total) * 100) : 0 },
      unproductive: { duration: unproductive, pct: total > 0 ? Math.round((unproductive / total) * 100) : 0 },
      idle: { duration: idle, pct: total > 0 ? Math.round((idle / total) * 100) : 0 },
      total
    };
  }, [classifiedLogs]);



  const timeFilterLabel = useMemo(() => {
    switch (timeFilter) {
      case "daily": return "today";
      case "yesterday": return "yesterday";
      case "weekly": return "this week";
      case "monthly": return "this month";
      case "custom": return "on selected date";
      case "all": return "all time";
      default: return "today";
    }
  }, [timeFilter]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#070b13] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-white/10 border-t-blue-500 rounded-full animate-spin"></div>
          <div className="text-slate-400 text-xs font-medium tracking-wide mt-1">Loading dashboard...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070b13] text-slate-100 p-4 md:p-6 font-sans selection:bg-blue-500/30 overflow-x-hidden relative">
      <div className="fixed inset-0 bg-[#070b13] -z-10" />

      <div className="max-w-7xl mx-auto space-y-4 relative z-10">

        {/* HEADER */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-3 border-b border-slate-800 pb-3 relative z-30">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
              <Laptop className="w-5 h-5 text-blue-500" /> Employee Dashboard <span className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-900 text-slate-400 border border-slate-800 rounded">Console</span>
            </h1>
            <p className="text-[10px] text-slate-400 mt-0.5 font-medium tracking-wide uppercase">
              Welcome back, {employeeName}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Time filters Dropdown */}
            <Dropdown
              options={timeFilterOptions}
              value={timeFilter}
              onChange={(val) => setTimeFilter(val as any)}
              icon={CalendarDays}
            />
            {timeFilter === "custom" && (
              <input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="px-2.5 py-1 bg-[#121826] border border-slate-800 rounded text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all font-sans cursor-pointer h-[32px] [color-scheme:dark]"
              />
            )}

            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-slate-200 border border-slate-800 rounded transition-all cursor-pointer flex items-center justify-center h-[32px]"
              title="Refresh logs & dashboard"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-blue-400" : "text-slate-400"}`} />
            </button>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 bg-red-950/20 hover:bg-red-950/40 text-red-400 border border-red-900/20 rounded transition-all text-xs font-medium cursor-pointer h-[32px]"
            >
              Logout
            </button>
          </div>
        </header>

        {/* KPI STATUS BAR */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <CompactStatWidget
            label="Active Time"
            value={formatDuration(totalDuration)}
            colorClass="text-blue-400"
          />
          <CompactStatWidget
            label="Productivity Rate"
            value={`${productivityRate}%`}
            colorClass={productivityRate >= 70 ? "text-emerald-400" : "text-slate-300"}
          />
          <CompactStatWidget
            label="Your Role"
            value={FALLBACK_ROLES[roleName]?.name || roleName.replace("_", " ")}
            colorClass="text-indigo-400"
          />
          <CompactStatWidget
            label="Active Status"
            value={userStatus === "dnd" ? "DND" : userStatus}
            colorClass={userStatus === "online" ? "text-emerald-400" : userStatus === "dnd" ? "text-rose-400" : "text-amber-400"}
          />
        </div>



        {/* MIDDLE CHARTS & TRENDS GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Productivity Distribution stacked horizontal bar style */}
          <div className="bg-[#121826] border border-slate-800 rounded shadow-sm overflow-hidden col-span-1">
            <div className="px-4 py-2 border-b border-slate-800 bg-[#111827]/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-emerald-500" />
                <h2 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Work Distribution</h2>
              </div>
            </div>

            <div className="p-3.5">
              <div className="grid grid-cols-3 gap-1.5 bg-[#111827]/40 border border-slate-800 rounded p-2 mb-4">
                <div className="text-center">
                  <span className="text-[8px] uppercase font-bold text-slate-500 block">Total Time</span>
                  <span className="text-xs font-semibold text-slate-300 block mt-0.5 font-mono">{formatDuration(totalDailyTime)}</span>
                </div>
                <div className="text-center border-l border-slate-800">
                  <span className="text-[8px] uppercase font-bold text-slate-500 block">Active Time</span>
                  <span className="text-xs font-semibold text-slate-300 block mt-0.5 font-mono">{formatDuration(totalNonIdleTime)}</span>
                </div>
                <div className="text-center border-l border-slate-800">
                  <span className="text-[8px] uppercase font-bold text-slate-500 block">Idle Time</span>
                  <span className="text-xs font-semibold text-slate-300 block mt-0.5 font-mono">{formatDuration(totalIdleTime)}</span>
                </div>
              </div>

              {distributionStats.total === 0 ? (
                <div className="text-slate-505 text-center py-10 text-[11px] font-mono">
                  No data logs available.
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Segmented Horizontal Bar */}
                  <div className="w-full h-5 flex rounded overflow-hidden bg-slate-800 border border-slate-700">
                    {distributionStats.productive.pct > 0 && (
                      <div 
                        style={{ width: `${distributionStats.productive.pct}%` }} 
                        className="bg-[#10B981] h-full" 
                        title={`Productive: ${formatDuration(distributionStats.productive.duration)} (${distributionStats.productive.pct}%)`} 
                      />
                    )}
                    {distributionStats.neutral.pct > 0 && (
                      <div 
                        style={{ width: `${distributionStats.neutral.pct}%` }} 
                        className="bg-[#3B82F6] h-full" 
                        title={`Neutral: ${formatDuration(distributionStats.neutral.duration)} (${distributionStats.neutral.pct}%)`} 
                      />
                    )}
                    {distributionStats.unproductive.pct > 0 && (
                      <div 
                        style={{ width: `${distributionStats.unproductive.pct}%` }} 
                        className="bg-[#EF4444] h-full" 
                        title={`Unproductive: ${formatDuration(distributionStats.unproductive.duration)} (${distributionStats.unproductive.pct}%)`} 
                      />
                    )}
                    {distributionStats.idle.pct > 0 && (
                      <div 
                        style={{ width: `${distributionStats.idle.pct}%` }} 
                        className="bg-[#6B7280] h-full" 
                        title={`Idle: ${formatDuration(distributionStats.idle.duration)} (${distributionStats.idle.pct}%)`} 
                      />
                    )}
                  </div>

                  {/* Summary Metrics */}
                  <div className="space-y-1.5 text-[10px] font-mono">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded bg-[#10B981]" />
                        <span className="text-slate-400">Productive Time:</span>
                      </div>
                      <span className="text-slate-200 font-semibold">
                        {formatDuration(distributionStats.productive.duration)} ({distributionStats.productive.pct}%)
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded bg-[#3B82F6]" />
                        <span className="text-slate-400">Neutral Time:</span>
                      </div>
                      <span className="text-slate-200 font-semibold">
                        {formatDuration(distributionStats.neutral.duration)} ({distributionStats.neutral.pct}%)
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded bg-[#EF4444]" />
                        <span className="text-slate-400">Unproductive Time:</span>
                      </div>
                      <span className="text-slate-200 font-semibold">
                        {formatDuration(distributionStats.unproductive.duration)} ({distributionStats.unproductive.pct}%)
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded bg-[#6B7280]" />
                        <span className="text-slate-400">Idle Time:</span>
                      </div>
                      <span className="text-slate-200 font-semibold">
                        {formatDuration(distributionStats.idle.duration)} ({distributionStats.idle.pct}%)
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Focus & Activity Timeline AreaChart */}
          <div className="bg-[#121826] border border-slate-800 rounded shadow-sm overflow-hidden col-span-1 lg:col-span-2">
            <div className="px-4 py-2 border-b border-slate-800 bg-[#111827]/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-500" />
                <h2 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Focus & Activity Timeline</h2>
              </div>
            </div>

            <div className="p-3">
              {/* Timeline Header Summary stats */}
              <div className="grid grid-cols-3 gap-2 bg-[#111827]/40 border border-slate-800 rounded p-2 mb-3 text-center text-[10px] font-mono">
                <div>
                  <span className="text-slate-500 uppercase text-[8px] font-bold block">Avg Focus Score</span>
                  <span className="text-xs font-bold text-blue-400 block mt-0.5">{timelineSummaryStats.avgFocus}%</span>
                </div>
                <div className="border-l border-slate-800">
                  <span className="text-slate-500 uppercase text-[8px] font-bold block">Peak Focus Hour</span>
                  <span className="text-xs font-bold text-emerald-400 block mt-0.5">{timelineSummaryStats.peakFocusTime}</span>
                </div>
                <div className="border-l border-slate-800">
                  <span className="text-slate-500 uppercase text-[8px] font-bold block">Total Active</span>
                  <span className="text-xs font-bold text-slate-300 block mt-0.5">{formatDuration(totalNonIdleTime)}</span>
                </div>
              </div>

              <div className="min-h-[196px] -ml-4 relative">
                {classifiedLogs.length === 0 ? (
                  <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-xs font-mono">
                    No data logs recorded.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={196}>
                    <AreaChart data={hourlyFocusTrend}>
                      <defs>
                        <linearGradient id="focusColor" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.15}/>
                          <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.02)" vertical={false} />
                      <XAxis dataKey="time" stroke="#475569" tick={{ fill: "#64748b", fontSize: 8 }} tickLine={false} axisLine={false} />
                      <YAxis stroke="#475569" tick={{ fill: "#64748b", fontSize: 8 }} tickLine={false} axisLine={false} domain={[0, 100]} />
                      
                      <ReTooltip content={<TimelineTooltip />} />
                      
                      <ReferenceArea 
                        x1="10 AM" 
                        x2="6 PM" 
                        fill="rgba(59, 130, 246, 0.08)" 
                        label={{ value: 'WORKING HOURS', position: 'insideTop', fill: '#3B82F6', fontSize: 8, fontWeight: 'bold', opacity: 0.4, letterSpacing: '0.05em' }} 
                      />
                      <ReferenceLine x="10 AM" stroke="#3b82f6" strokeDasharray="3 3" opacity={0.4} />
                      <ReferenceLine x="6 PM" stroke="#3b82f6" strokeDasharray="3 3" opacity={0.4} />

                      <Area
                        type="monotone"
                        dataKey="Focus Score"
                        stroke="#3B82F6"
                        strokeWidth={1.5}
                        fillOpacity={1}
                        fill="url(#focusColor)"
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
