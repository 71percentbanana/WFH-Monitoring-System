"use client";

import { useEffect, useState, useMemo, Fragment } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  PieChart, Pie, Cell, Tooltip as ReTooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  AreaChart, Area,
} from "recharts";
import {
  Users, Activity, TrendingUp, Clock, ChevronDown,
  BarChart2, PieChart as PieIcon, Target, Zap, AlertTriangle, Layers,
  Flame, Award, Sparkles, ShieldAlert, Terminal, Timer,
  RefreshCw, Sliders, CalendarDays, ChevronRight, Eye
} from "lucide-react";
import { classifyActivityWithAI, PRODUCTIVITY_COLORS, FALLBACK_ROLES } from "../../lib/classifier";
import { calculateSessionMetrics } from "../../lib/sessionEngine";
import Dropdown from "../components/Dropdown";

// =================================================
// CONSTANTS & HELPERS
// =================================================
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

const formatTime = (isoString?: string): string => {
  if (!isoString) return "-";
  try {
    return new Date(isoString).toLocaleTimeString([], {
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
    });
  } catch { return "-"; }
};

const getCategoryColor = (cat: string): string =>
  CATEGORY_COLORS[cat] || CATEGORY_COLORS.Neutral;

// =================================================
// COMPONENTS
// =================================================
function StatCard({ icon: Icon, label, value, sub, accent, glowColor }: {
  icon: any; label: string; value: string; sub?: string; accent: string; glowColor?: string;
}) {
  return (
    <div className="relative group h-full">
      <div className="relative bg-[#121826] border border-white/5 rounded-[14px] p-5 flex items-center justify-between gap-4 h-full shadow-sm hover:border-white/10 transition-colors">
        <div className="flex items-center gap-4 h-full w-full">
          <div className="p-3 rounded-lg bg-[#111827] border border-white/5 shrink-0">
            <Icon className={`w-5 h-5 ${glowColor || "text-slate-400"}`} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
            <p className="text-2xl font-semibold text-slate-100 tracking-tight mt-0.5">{value}</p>
            {sub && <p className="text-xs text-slate-500 mt-1 font-medium leading-snug">{sub}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

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
            {typeof entry.value === "number" && entry.name?.toLowerCase().includes("score")
              ? (entry.value > 0 ? `+${entry.value}` : entry.value)
              : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
};

// =================================================
// MAIN ADMIN DASHBOARD
// =================================================
export default function AdminDashboard() {
  const router = useRouter();
  const [activities, setActivities] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [adminName, setAdminName] = useState("");
  
  // Department filter & selectors
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>("All");
  const [selectedEmployee, setSelectedEmployee] = useState<string>("All");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  
  // Database roles mappings
  const [employeeRolesMap, setEmployeeRolesMap] = useState<Record<string, string>>({});
  
  // Detail Row expanded state
  const [expandedRowId, setExpandedRowId] = useState<number | null>(null);

  // Registered employees list from DB
  const [registeredEmployees, setRegisteredEmployees] = useState<string[]>([]);

  // Visible activity log limit for pagination
  const [visibleLogsCount, setVisibleLogsCount] = useState(15);

  // Sync selected employee with search input
  useEffect(() => {
    if (selectedEmployee === "All") {
      setSearchTerm("");
    } else {
      setSearchTerm(selectedEmployee);
    }
  }, [selectedEmployee]);

  // Authentication Guard
  useEffect(() => {
    const role = localStorage.getItem("userRole");
    const name = localStorage.getItem("userName");
    if (role !== "admin") {
      router.push("/");
    } else {
      setAdminName(name || "Admin");
      setIsLoading(false);
    }
  }, [router]);

  // Initial Fetches and Zero-Polling Real-Time stream
  useEffect(() => {
    if (isLoading) return;

    // Fetch initial mappings and raw logs
    async function loadData() {
      // 1. Fetch Users (all registered employees)
      const { data: usersData } = await supabase
        .from("users")
        .select("id, username, role");
      
      if (usersData) {
        const empNames = usersData
          .filter((u: any) => u.role === "employee")
          .map((u: any) => u.username)
          .filter(Boolean);
        setRegisteredEmployees(empNames);
      }
      
      // 2. Fetch Assigned Roles
      let mappings: any[] = [];
      try {
        const { data: roleAssignments } = await supabase
          .from("employee_roles")
          .select("employee_id, roles(id, name)");
        if (roleAssignments) mappings = roleAssignments;
      } catch (e) {
        console.warn("Could not load employee_roles, using fallbacks.", e);
      }

      const map: Record<string, string> = {};
      if (usersData && mappings.length > 0) {
        mappings.forEach((m: any) => {
          const user = usersData.find((u: any) => u.id === m.employee_id);
          if (user && m.roles) {
            map[user.username] = m.roles.name;
          }
        });
      }
      setEmployeeRolesMap(map);

      // 3. Fetch Activity Logs
      const { data: logsData, error } = await supabase
        .from("activity_logs")
        .select("*")
        .order("start_time", { ascending: false })
        .limit(300);

      if (!error && logsData) {
        setActivities(logsData);
      }
    }

    loadData();

    // Bind dynamic Real-Time postgres insertion trigger (zero-polling)
    const channel = supabase
      .channel("activity-channel-admin")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_logs" }, (payload) => {
        setActivities((prev) => [payload.new, ...prev]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isLoading]);

  const handleLogout = () => {
    localStorage.removeItem("userRole");
    localStorage.removeItem("userName");
    router.push("/");
  };

  // =================================================
  // COGNITIVE INTEL COMPUTATIONS
  // =================================================
  const uniqueEmployees = useMemo(() => {
    const activeNames = activities.map(a => a.employee_name).filter(Boolean);
    const allNames = Array.from(new Set([...registeredEmployees, ...activeNames]));
    return ["All", ...allNames];
  }, [activities, registeredEmployees]);

  const matchingEmployees = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return [];
    return uniqueEmployees.filter(emp =>
      emp !== "All" && emp.toLowerCase().includes(term)
    );
  }, [uniqueEmployees, searchTerm]);

  const availableRolesList = useMemo(() =>
    ["All", ...Object.values(FALLBACK_ROLES).map(r => r.name)],
    []);

  const departmentOptions = useMemo(() => {
    return availableRolesList.map(role => ({
      value: role,
      label: role === "All" ? "All Departments" : role.replace("_", " ").toUpperCase()
    }));
  }, [availableRolesList]);

  const employeeOptions = useMemo(() => {
    return uniqueEmployees
      .filter(emp => {
        if (emp === "All") return true;
        const role = employeeRolesMap[emp] || "role_1";
        return selectedRoleFilter === "All" || role === selectedRoleFilter;
      })
      .map(emp => ({
        value: emp,
        label: emp === "All" ? "All Employees" : emp
      }));
  }, [uniqueEmployees, employeeRolesMap, selectedRoleFilter]);

  // Sort and classify WFH activities exactly once
  const classifiedActivities = useMemo(() => {
    return activities.map((log) => {
      const roleName = employeeRolesMap[log.employee_name] || "role_1";
      const ai = classifyActivityWithAI(
        log.app_name,
        log.website,
        log.category || "Neutral",
        roleName,
        log.duration_seconds || 0
      );
      return {
        ...log,
        ai
      };
    });
  }, [activities, employeeRolesMap]);

  // Individual statistics
  const employeeSessionStats = useMemo(() => {
    const list: {
      username: string;
      roleName: string;
      productivityRate: number;
      totalDuration: number;
      currentStatus: string;
      logs: any[];
    }[] = [];

    const usernames = uniqueEmployees.filter(e => e !== "All");

    usernames.forEach(user => {
      const empLogs = classifiedActivities.filter(a => a.employee_name === user);
      const roleName = employeeRolesMap[user] || "role_1";

      let productiveDuration = 0;
      let activeDuration = 0;
      empLogs.filter(l => !l.app_name?.startsWith("STATUS_CHANGE")).forEach(l => {
        if (l.ai.category === "Productive") {
          productiveDuration += l.duration_seconds || 0;
        }
        activeDuration += l.duration_seconds || 0;
      });

      const productivityRate = activeDuration > 0 ? Math.round((productiveDuration / activeDuration) * 100) : 0;
      const statusLog = empLogs.find(l => l.app_name?.startsWith("STATUS_CHANGE"));
      const currentStatus = statusLog ? statusLog.app_name.split(" | ")[1] || "offline" : "offline";

      list.push({
        username: user,
        roleName,
        productivityRate,
        totalDuration: activeDuration,
        currentStatus,
        logs: empLogs
      });
    });

    return list.sort((a, b) => b.productivityRate - a.productivityRate);
  }, [classifiedActivities, employeeRolesMap, uniqueEmployees]);

  // Apply filters
  const filteredEmployeesStats = useMemo(() => {
    return employeeSessionStats.filter(emp => {
      const matchesRole = selectedRoleFilter === "All" || emp.roleName === selectedRoleFilter;
      const matchesEmployee = selectedEmployee === "All" || emp.username === selectedEmployee;
      return matchesRole && matchesEmployee;
    });
  }, [employeeSessionStats, selectedRoleFilter, selectedEmployee]);

  // Aggregated Team Stats
  const teamAggregates = useMemo(() => {
    const total = filteredEmployeesStats.length;
    if (total === 0) {
      return { avgProductivity: 0, totalHoursTracked: 0, activeCount: 0, mostActiveUser: "-" };
    }
    const sumProductivity = filteredEmployeesStats.reduce((s, e) => s + e.productivityRate, 0);
    const totalTime = filteredEmployeesStats.reduce((s, e) => s + e.totalDuration, 0);
    const activeOnline = filteredEmployeesStats.filter(e => e.currentStatus === "online" || e.currentStatus === "dnd").length;
    
    // Most active employee
    const sortedByTime = [...filteredEmployeesStats].sort((a, b) => b.totalDuration - a.totalDuration);
    const mostActiveUser = sortedByTime[0] ? sortedByTime[0].username : "-";

    return {
      avgProductivity: Math.round(sumProductivity / total),
      totalHoursTracked: parseFloat((totalTime / 3600).toFixed(1)),
      activeCount: activeOnline,
      mostActiveUser
    };
  }, [filteredEmployeesStats]);

  // Raw filtered activity list for graphs and timeline
  const filteredActivities = useMemo(() => {
    return classifiedActivities.filter(a => {
      const roleName = employeeRolesMap[a.employee_name] || "role_1";
      const matchesRole = selectedRoleFilter === "All" || roleName === selectedRoleFilter;
      const matchesEmployee = selectedEmployee === "All" || a.employee_name === selectedEmployee;
      return matchesRole && matchesEmployee;
    });
  }, [classifiedActivities, selectedRoleFilter, selectedEmployee, employeeRolesMap]);

  // Timeline Logs for selected stepper employee
  const timelineLogs = useMemo(() => {
    if (!selectedEmployee || selectedEmployee === "All") return [];
    return classifiedActivities
      .filter(a => a.employee_name === selectedEmployee)
      .slice(0, 15) // Capture last 15 active steps
      .reverse(); // Chronological bottom-to-top stepper
  }, [classifiedActivities, selectedEmployee]);

  // Team Category Pie Chart Distribution
  const categoryChartData = useMemo(() => {
    const breakdown: Record<string, number> = {};
    filteredActivities.forEach(a => {
      breakdown[a.ai.category] = (breakdown[a.ai.category] || 0) + (a.duration_seconds || 0);
    });
    return Object.entries(breakdown)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value, raw: value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredActivities]);

  // Hourly Productivity Trend overall
  const hourlyFocusTrend = useMemo(() => {
    const hoursMap: Record<number, { sum: number; count: number }> = {};
    for (let i = 8; i <= 20; i++) {
      hoursMap[i] = { sum: 0, count: 0 };
    }

    filteredActivities.forEach(a => {
      if (!a.start_time) return;
      const hour = new Date(a.start_time).getHours();
      if (hour >= 8 && hour <= 20) {
        hoursMap[hour].sum += a.ai.score;
        hoursMap[hour].count++;
      }
    });

    return Object.entries(hoursMap).map(([hour, val]) => {
      const avg = val.count > 0 ? Math.round((val.sum / val.count) * 10) / 10 : 0;
      const parsedHour = parseInt(hour);
      const period = parsedHour >= 12 ? "PM" : "AM";
      const formatHour = parsedHour % 12 === 0 ? 12 : parsedHour % 12;
      return {
        time: `${formatHour} ${period}`,
        "Focus Score": Math.max(0, Math.min(100, Math.round((avg + 10) * 5))) // Normalize score domain [-10,10] to [0,100] for UI
      };
    });
  }, [filteredActivities]);



  if (isLoading) return (
    <div className="min-h-screen bg-[#0B1020] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-6 h-6 border-2 border-white/10 border-t-blue-500 rounded-full animate-spin"></div>
        <div className="text-slate-400 text-xs font-medium tracking-wide mt-1">Loading dashboard...</div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0B1020] text-slate-100 p-6 md:p-8 font-sans selection:bg-blue-500/30 overflow-x-hidden relative">
      {/* Background visual gradients replaced with flat B2B canvas */}
      <div className="fixed inset-0 bg-[#0B1020] -z-10" />

      <div className="max-w-7xl mx-auto space-y-6 relative z-10">


        {/* HEADER */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-white/5 pb-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-100 flex items-center gap-2">
              WFH Monitor
            </h1>
            <p className="text-xs text-slate-400 mt-1 font-medium tracking-wide">
              Workforce Activity & Productivity Analytics
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap justify-end">
            <Link
              href="/admin/employees"
              className="px-4 py-2 bg-slate-800/60 hover:bg-slate-700/60 text-slate-200 border border-white/5 rounded-lg transition-all text-xs font-medium flex items-center gap-2 cursor-pointer"
            >
              <Users className="w-3.5 h-3.5 text-blue-500" /> Manage Employees
            </Link>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-500/10 rounded-lg transition-all text-xs font-medium cursor-pointer"
            >
              Logout
            </button>
          </div>
        </header>

        {/* METRICS STATS */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={Users}
            label="Active Workforce"
            value={String(filteredEmployeesStats.length)}
            sub={selectedEmployee === "All" ? "Employees tracked" : "Filtered match"}
            accent="from-slate-500/5 to-slate-600/5"
            glowColor="text-blue-500"
          />
          <StatCard
            icon={Target}
            label="Workforce Productivity"
            value={`${teamAggregates.avgProductivity}%`}
            sub="Average productive time today"
            accent="from-slate-500/5 to-slate-600/5"
            glowColor="text-emerald-500"
          />
          <StatCard
            icon={Clock}
            label="Workspace Hours"
            value={`${teamAggregates.totalHoursTracked}h`}
            sub="Aggregated active time today"
            accent="from-slate-500/5 to-slate-600/5"
            glowColor="text-blue-400"
          />
          <StatCard
            icon={Activity}
            label="Currently Active Staff"
            value={`${teamAggregates.activeCount} Online`}
            sub="Staff currently online"
            accent="from-slate-500/5 to-slate-600/5"
            glowColor={teamAggregates.activeCount > 0 ? "text-emerald-500" : "text-slate-500"}
          />
        </div>

        {/* ADVANCED FILTERING CONTROL BAR */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-[#121826] border border-white/5 p-3 rounded-xl shadow-sm relative z-30">
          <div className="flex items-center gap-2.5">
            <Sliders className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Dash Filtering</span>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            <Dropdown
              options={departmentOptions}
              value={selectedRoleFilter}
              onChange={(val) => {
                setSelectedRoleFilter(val);
                setSelectedEmployee("All");
              }}
              label="Designation:"
            />

            {/* SEARCH EMPLOYEE TYPEAHEAD */}
            <div className="relative w-52 z-40">
              <div className="flex items-center bg-[#111827] border border-white/5 rounded-lg px-3 py-1.5 focus-within:ring-1 focus-within:ring-blue-500/50">
                <Users className="w-3.5 h-3.5 text-blue-500 mr-2 shrink-0" />
                <input
                  type="text"
                  placeholder="Search employee..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setIsDropdownOpen(true);
                  }}
                  onFocus={() => setIsDropdownOpen(true)}
                  onBlur={() => setTimeout(() => setIsDropdownOpen(false), 200)}
                  className="w-full bg-transparent border-none text-slate-200 placeholder:text-slate-500 focus:outline-none text-xs"
                />
                {searchTerm && (
                  <button
                    onClick={() => {
                      setSearchTerm("");
                      setSelectedEmployee("All");
                    }}
                    className="text-slate-500 hover:text-slate-300 text-xs ml-1 focus:outline-none cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>
              {isDropdownOpen && matchingEmployees.length > 0 && (
                <div className="absolute left-0 right-0 mt-1 bg-[#121826] border border-white/10 rounded-lg shadow-xl max-h-48 overflow-y-auto z-50 divide-y divide-white/5 backdrop-blur-md">
                  {matchingEmployees.map((empName) => {
                    const roleName = employeeRolesMap[empName] || "role_1";
                    const roleLabel = FALLBACK_ROLES[roleName]?.name || roleName.replace("_", " ");
                    return (
                      <button
                        key={empName}
                        onClick={() => {
                          setSearchTerm(empName);
                          setSelectedEmployee(empName);
                          setIsDropdownOpen(false);
                        }}
                        className="w-full text-left px-3.5 py-2 hover:bg-blue-500/10 hover:text-blue-400 transition-colors flex flex-col cursor-pointer"
                      >
                        <span className="text-xs font-medium text-slate-200 hover:text-inherit">{empName}</span>
                        <span className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-wider font-mono">{roleLabel}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* TEAM CHARTS & WORK DETAILS COLUMN */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Activity Breakdown Pie Chart */}
          <div className="relative group col-span-1">
            <div className="relative bg-[#121826] border border-white/5 rounded-[14px] p-5 h-full flex flex-col justify-between shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[#111827] border border-white/5 rounded-lg">
                    <Target className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-200 tracking-wide">Work Distribution</h2>
                    <p className="text-[11px] text-slate-500 mt-0.5">By overall tracked timers</p>
                  </div>
                </div>
              </div>

              {categoryChartData.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-10 text-slate-500 text-xs">
                  No activity logs logged in selection.
                </div>
              ) : (
                <>
                  <div className="flex-1 min-h-[220px] flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={65}
                          outerRadius={85}
                          paddingAngle={4}
                          dataKey="value"
                          stroke="none"
                        >
                          {categoryChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={getCategoryColor(entry.name)} />
                          ))}
                        </Pie>
                        <ReTooltip content={<CustomTooltip />} formatter={(v: any) => formatDuration(v)} />
                        <Legend
                          formatter={(value) => <span className="text-[11px] text-slate-400 font-medium">{value}</span>}
                          wrapperStyle={{ paddingTop: "12px", fontSize: "10px" }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Team Focus Intensity Curve */}
          <div className="relative group col-span-1 lg:col-span-2">
            <div className="relative bg-[#121826] border border-white/5 rounded-[14px] p-5 h-full flex flex-col justify-between shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-[#111827] border border-white/5 rounded-lg">
                  <Clock className="w-4 h-4 text-blue-500" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-slate-200 tracking-wide">Workplace Focus Intensity</h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">Average focus indices mapped over standard business hours</p>
                </div>
              </div>

              <div className="flex-1 min-h-[220px] -ml-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={hourlyFocusTrend}>
                    <defs>
                      <linearGradient id="focusGlowGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                    <XAxis dataKey="time" stroke="#475569" tick={{ fill: "#64748b", fontSize: 9 }} tickLine={false} axisLine={false} />
                    <YAxis stroke="#475569" tick={{ fill: "#64748b", fontSize: 9 }} tickLine={false} axisLine={false} domain={[0, 100]} />
                    <ReTooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="Focus Score"
                      stroke="#3B82F6"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#focusGlowGrad)"
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

        </div>

        {/* WORKFORCE DIRECTORY & BROADCAST STATUS BOARD */}
        <div className="relative group">
          <div className="relative bg-[#121826] border border-white/5 rounded-[14px] p-6 shadow-sm">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-white/5 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#111827] border border-white/5 rounded-lg">
                  <Users className="w-4 h-4 text-blue-500" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-200">Workforce Status & Directory</h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">Real-time status updates and productivity rates of WFH employees</p>
                </div>
              </div>
              <span className="text-[9px] text-slate-400 font-semibold uppercase bg-[#111827] px-3 py-1 border border-white/5 rounded-md tracking-wider">
                Live Activity Feeds
              </span>
            </div>

            {filteredEmployeesStats.length === 0 ? (
              <p className="text-slate-500 text-center py-10 text-xs">No employees tracked under selection.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredEmployeesStats.map((emp) => {
                  const statusColors = {
                    online: { bg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/10", dot: "bg-emerald-500", text: "Online" },
                    dnd: { bg: "bg-rose-500/10 text-rose-400 border-rose-500/10", dot: "bg-rose-500 animate-pulse", text: "DND" },
                    idle: { bg: "bg-amber-500/10 text-amber-400 border-amber-500/10", dot: "bg-amber-500", text: "Idle" },
                    offline: { bg: "bg-slate-500/10 text-slate-400 border-white/5", dot: "bg-slate-500", text: "Offline" }
                  };
                  const status = (emp.currentStatus || "online").toLowerCase() as keyof typeof statusColors;
                  const cfg = statusColors[status] || statusColors.online;

                  return (
                    <div key={emp.username} className="bg-[#111827]/40 border border-white/5 rounded-xl p-4 hover:bg-[#111827]/80 hover:border-white/10 transition-all shadow-sm">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-800 border border-white/5 flex items-center justify-center font-semibold text-xs text-slate-200">
                            {emp.username.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-semibold text-sm text-slate-100">{emp.username}</span>
                            <span className="text-[9px] text-slate-500 block uppercase tracking-wider mt-0.5">{FALLBACK_ROLES[emp.roleName]?.name || emp.roleName.replace("_", " ")}</span>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-semibold ${cfg.bg}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                          {cfg.text}
                        </div>
                      </div>

                      <div className="space-y-3 border-t border-white/5 pt-3">
                        <div className="flex justify-between text-xs font-medium text-slate-400">
                          <span>Active Time Logged:</span>
                          <span className="text-slate-100 font-semibold">{formatDuration(emp.totalDuration)}</span>
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex justify-between text-xs font-medium text-slate-400">
                            <span>Productivity Rate:</span>
                            <span className={`font-semibold ${emp.productivityRate >= 70 ? 'text-emerald-400' : 'text-slate-300'}`}>{emp.productivityRate}%</span>
                          </div>
                          {/* Simple, sleek progress bar */}
                          <div className="w-full h-1.5 bg-slate-800/60 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${emp.productivityRate >= 70 ? 'bg-emerald-500' : 'bg-blue-500'}`}
                              style={{ width: `${emp.productivityRate}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

          </div>
        </div>

        {/* COGNITIVE TIMELINE REPLAY STEPS SECTION */}
        <div className="grid grid-cols-1 gap-6">

          {/* Cognitive Timeline Stepper Replay */}
          <div className="relative group overflow-hidden">
            <div className="relative bg-[#121826] border border-white/5 rounded-[14px] p-5 h-full flex flex-col shadow-sm">
              <div className="flex items-center justify-between mb-6 border-b border-white/5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[#111827] border border-white/5 rounded-lg">
                    <Activity className="w-4 h-4 text-blue-500" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-200">Daily Activity Timeline</h2>
                    <p className="text-[11px] text-slate-500">Chronological logs for <span className="text-blue-500 font-semibold">{selectedEmployee || "Select an employee"}</span></p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[9px] text-slate-500 font-semibold block uppercase tracking-wider">Selected Designation</span>
                  <span className="text-[10px] text-slate-400 font-medium bg-[#111827] px-2.5 py-0.5 border border-white/5 rounded-md uppercase tracking-wider font-mono">
                    {selectedEmployee === "All" ? "N/A" : FALLBACK_ROLES[employeeRolesMap[selectedEmployee] || "role_1"]?.name || (employeeRolesMap[selectedEmployee] || "role_1")}
                  </span>
                </div>
              </div>

              {selectedEmployee === "All" ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-500 py-16">
                  <Activity className="w-10 h-10 text-slate-600/50 animate-pulse mb-3" />
                  <p className="text-sm">Select a specific employee in the Dash Filtering bar above to view their activity timeline.</p>
                </div>
              ) : timelineLogs.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-500 py-16">
                  <Activity className="w-10 h-10 text-slate-600/50 animate-pulse mb-3" />
                  <p className="text-sm">No activity logs recorded for this employee today.</p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto max-h-[480px] pr-2 pl-2">
                  <div className="relative border-l-2 border-slate-800/80 ml-3.5 space-y-6">
                    {timelineLogs.map((item, index) => {
                      const ai = item.ai;
                      const catColor = getCategoryColor(ai.category);
                      const isStatus = (item.app_name || "").startsWith("STATUS_CHANGE");
                      const isBrowser = !isStatus && ((item.app_name || "").toLowerCase().includes("chrome") ||
                        (item.app_name || "").toLowerCase().includes("browser") ||
                        (item.website || "").includes("."));

                      return (
                        <div key={item.id || index} className="relative pl-7 group/timeline animate-in fade-in slide-in-from-left-2 duration-300">
                           {/* Chronological Connector Circle */}
                          <span
                            className="absolute -left-[9px] top-1.5 flex h-4 w-4 rounded-full border-2 transition-transform duration-300 group-hover/timeline:scale-125"
                            style={{
                              backgroundColor: "#0B1020",
                              borderColor: catColor,
                            }}
                          />

                          {/* Stepper block wrapper */}
                          <div className="bg-[#121826] border border-white/5 rounded-[14px] p-4 hover:border-white/10 transition-colors shadow-sm animate-in fade-in duration-300">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 mb-2">
                              {/* Left detail */}
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-sm text-slate-200 group-hover/timeline:text-blue-500 transition-colors">
                                  {ai.cleanName}
                                </span>
                                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border tracking-wider uppercase ${
                                  isStatus ? "bg-purple-500/10 text-purple-400 border-purple-500/10" :
                                  isBrowser ? "bg-blue-500/10 text-blue-400 border-blue-500/10" : 
                                  "bg-amber-500/10 text-amber-400 border-amber-500/10"
                                }`}>
                                  {isStatus ? "System" : isBrowser ? "Domain" : "App"}
                                </span>
                                <span
                                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-semibold border uppercase tracking-wide"
                                  style={{
                                    backgroundColor: `${catColor}15`,
                                    color: catColor,
                                    borderColor: `${catColor}10`,
                                  }}
                                >
                                  {ai.category}
                                </span>
                              </div>

                              {/* Timers details */}
                              <div className="flex items-center gap-3 text-xs text-slate-500 font-mono">
                                <span>{formatTime(item.start_time)}</span>
                                <span className="text-slate-600">·</span>
                                <span className="font-medium text-slate-400">{formatDuration(item.duration_seconds)}</span>
                              </div>
                            </div>

                            {/* Raw logging string and Explainable AI explanation */}
                            <div className="space-y-2 mt-2">
                              <p className="text-xs text-slate-400 font-medium italic">
                                {item.website || item.app_name || "Raw context captured"}
                              </p>
                              
                              {/* EXPLAINABLE POLICY METADATA */}
                              <div className="bg-[#111827] border border-white/5 p-2.5 rounded-lg text-xs space-y-1.5 font-medium leading-relaxed text-slate-300">
                                <div className="flex items-center gap-1.5 text-blue-400 font-semibold">
                                  <Sparkles className="w-3.5 h-3.5 text-blue-400" /> AI Productivity Insight
                                </div>
                                <div className="text-slate-400 leading-snug">{ai.reason}</div>
                                {ai.modifiersApplied && ai.modifiersApplied.length > 0 && (
                                  <div className="border-t border-white/5 mt-2 pt-2 space-y-1">
                                    <div className="text-[10px] text-blue-400 font-semibold uppercase tracking-wider font-sans">Applied score adjustments:</div>
                                    {ai.modifiersApplied.map((mod: string, mi: number) => (
                                      <div key={mi} className="text-[11px] text-slate-300 flex items-center gap-1.5 font-sans">
                                        <Activity className="w-3 h-3 text-blue-500 flex-shrink-0" /> {mod}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Score Display Pill */}
                            <div className="flex justify-end mt-3">
                              <span className={`text-xs font-semibold font-mono px-2.5 py-1 rounded-md border ${ai.score > 0 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/10" : ai.score < 0 ? "bg-rose-500/10 text-rose-400 border-rose-500/10" : "bg-slate-800 text-slate-400 border-white/5"}`}>
                                {ai.score > 0 ? `+${ai.score}` : ai.score} Productivity Value
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* LIVE ACTIVITY LOGGER VIEW DETAILED LIST */}
        <div className="relative group">
          <div className="relative bg-[#121826] border border-white/5 rounded-[14px] shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Activity className="w-4 h-4 text-blue-500" />
                <h2 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Live Raw Activity Stream</h2>
              </div>
              <span className="text-xs text-slate-500">Showing {Math.min(visibleLogsCount, filteredActivities.length)} of {filteredActivities.length} entries</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="text-[11px] uppercase tracking-wider text-slate-400 bg-[#111827]/80 border-b border-white/5">
                  <tr>
                    <th className="w-10 px-4 py-3" />
                    <th className="px-6 py-3 font-semibold">Employee</th>
                    <th className="px-6 py-3 font-semibold">Designation</th>
                    <th className="px-6 py-3 font-semibold">Normalized Process</th>
                    <th className="px-6 py-3 font-semibold">AI Classification</th>
                    <th className="px-6 py-3 font-semibold">Start</th>
                    <th className="px-6 py-3 font-semibold">Duration</th>
                    <th className="px-6 py-3 font-semibold text-right">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredActivities.slice(0, visibleLogsCount).map((item, index) => {
                    const roleName = employeeRolesMap[item.employee_name] || "role_1";
                    const ai = item.ai;
                    const isStatusEntry = (item.app_name || "").startsWith("STATUS_CHANGE");
                    const isBrowserEntry = !isStatusEntry && ((item.app_name || "").toLowerCase().includes("chrome") ||
                      (item.app_name || "").toLowerCase().includes("browser") ||
                      (item.website || "").includes("."));
                    const isExpanded = expandedRowId === (item.id || index);

                    return (
                      <Fragment key={item.id || index}>
                        <tr
                          className={`group/row hover:bg-white/[0.02] transition-colors cursor-pointer ${isExpanded ? "bg-white/[0.01]" : ""}`}
                          onClick={() => setExpandedRowId(isExpanded ? null : (item.id || index))}
                        >
                          <td className="px-4 py-3 text-center">
                            <ChevronDown className={`w-4 h-4 mx-auto text-slate-500 group-hover/row:text-blue-500 transition-all duration-300 ${isExpanded ? "rotate-180 text-blue-500" : ""}`} />
                          </td>
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center font-semibold text-xs border border-blue-500/20">
                                {item.employee_name?.charAt(0).toUpperCase() || "?"}
                              </div>
                              <span className="text-sm font-semibold text-slate-200">{item.employee_name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-3">
                            <span className="text-[10px] font-medium text-slate-300 uppercase bg-[#111827] px-2 py-0.5 border border-white/5 rounded-md tracking-wider">
                              {FALLBACK_ROLES[roleName]?.name || roleName.replace("_", " ")}
                            </span>
                          </td>
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-200 group-hover/row:text-blue-400 transition-colors max-w-[180px] truncate">
                                {ai.cleanName}
                              </span>
                              <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border tracking-wider uppercase ${
                                isStatusEntry ? "bg-purple-500/10 text-purple-400 border-purple-500/10" :
                                isBrowserEntry ? "bg-blue-500/10 text-blue-400 border-blue-500/10" : 
                                "bg-amber-500/10 text-amber-400 border-amber-500/10"
                              }`}>
                                {isStatusEntry ? "System" : isBrowserEntry ? "Domain" : "App"}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-3">
                            <span
                              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold border uppercase tracking-wide"
                              style={{
                                backgroundColor: `${getCategoryColor(ai.category)}15`,
                                color: getCategoryColor(ai.category),
                                borderColor: `${getCategoryColor(ai.category)}10`,
                              }}
                            >
                              {ai.category}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-slate-400 font-mono text-xs">{formatTime(item.start_time)}</td>
                          <td className="px-6 py-3 text-slate-400 font-mono text-xs">{formatDuration(item.duration_seconds)}</td>
                          <td className="px-6 py-3 text-right">
                            <span className={`font-semibold font-mono text-sm min-w-[3rem] inline-flex items-center justify-end ${ai.score > 0 ? "text-emerald-400" : ai.score < 0 ? "text-rose-400" : "text-slate-400"}`}>
                              {ai.score > 0 ? "+" : ""}{ai.score}
                            </span>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="bg-[#111827]/60">
                            <td colSpan={8} className="px-8 py-5 border-b border-white/5">
                              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-in slide-in-from-top-2 duration-200">
                                <div className="md:col-span-2">
                                  <p className="text-[10px] uppercase font-bold text-slate-500 mb-1.5">Raw Context Input</p>
                                  <p className="text-xs font-mono text-slate-300 bg-[#0B1020] p-3 rounded-lg break-all border border-white/5 max-h-24 overflow-y-auto font-medium">
                                    {item.website || item.app_name || "—"}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[10px] uppercase font-bold text-slate-500 mb-1.5">AI Productivity Insight</p>
                                  <p className="text-xs font-medium text-slate-300 leading-relaxed bg-[#0B1020] border border-white/5 p-2.5 rounded-lg">
                                    {ai.reason}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[10px] uppercase font-bold text-slate-500 mb-1.5">Activity Log ID</p>
                                  <p className="text-xs text-slate-400 font-mono">#{item.id || index}</p>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {filteredActivities.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-6 py-16 text-center text-slate-500">
                        <div className="flex flex-col items-center justify-center space-y-4">
                          <div className="relative w-12 h-12">
                            <div className="absolute inset-0 rounded-full border-2 border-blue-500/20" />
                            <div className="absolute inset-0 rounded-full border-2 border-t-blue-500 animate-spin" />
                          </div>
                          <p className="tracking-wide animate-pulse">Waiting for live activity logs...</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {filteredActivities.length > visibleLogsCount && (
              <div className="flex justify-center py-4 border-t border-white/5 bg-[#111827]/40">
                <button
                  onClick={() => setVisibleLogsCount(prev => Math.min(prev + 20, filteredActivities.length))}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/5 rounded-lg transition-colors text-xs font-medium flex items-center gap-2 cursor-pointer"
                >
                  Load More Activity Logs
                </button>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
