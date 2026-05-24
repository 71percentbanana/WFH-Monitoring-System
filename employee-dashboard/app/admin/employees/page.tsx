"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import Link from "next/link";
import { FALLBACK_ROLES } from "../../../lib/classifier";
import Dropdown from "../../components/Dropdown";

export default function ManageEmployeesPage() {
  const router = useRouter();
  const [employees, setEmployees] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Roles list from either DB or local fallbacks
  const [roles, setRoles] = useState<any[]>([]);
  const [employeeRolesMap, setEmployeeRolesMap] = useState<Record<string, string>>({});

  const roleOptions = useMemo(() => {
    return roles.map(role => ({
      value: role.id,
      label: role.name.replace("_", " ").toUpperCase()
    }));
  }, [roles]);
  
  // Form State
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [message, setMessage] = useState("");

  // Delete Modal State
  const [employeeToDelete, setEmployeeToDelete] = useState<{id: string, username: string} | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  // =================================================
  // AUTH CHECK
  // =================================================
  useEffect(() => {
    const role = localStorage.getItem("userRole");
    if (role !== "admin") {
      router.push("/");
    } else {
      loadInitialData();
    }
  }, [router]);

  async function loadInitialData() {
    await fetchRoles();
    await fetchEmployees();
  }

  async function fetchRoles() {
    try {
      const { data, error } = await supabase
        .from("roles")
        .select("*");
      
      if (!error && data && data.length > 0) {
        setRoles(data);
        // Default select to knowledge_worker if available
        const defaultRole = data.find((r: any) => r.name === "knowledge_worker") || data[0];
        if (defaultRole) setSelectedRoleId(defaultRole.id);
      } else {
        // Fallback
        const fallbackList = Object.values(FALLBACK_ROLES);
        setRoles(fallbackList);
        setSelectedRoleId(fallbackList[0]?.id || "");
      }
    } catch (e) {
      const fallbackList = Object.values(FALLBACK_ROLES);
      setRoles(fallbackList);
      setSelectedRoleId(fallbackList[0]?.id || "");
    }
  }

  async function fetchEmployees() {
    try {
      const { data: usersData, error: usersError } = await supabase
        .from("users")
        .select("*")
        .eq("role", "employee")
        .order("created_at", { ascending: false });

      if (usersError) throw usersError;

      // Fetch employee roles mapping
      let mappings: any[] = [];
      try {
        const { data: mData } = await supabase
          .from("employee_roles")
          .select("employee_id, role_id, roles(id, name)");
        if (mData) mappings = mData;
      } catch (e) {
        console.warn("employee_roles table query failed or not migrated, using fallbacks.", e);
      }

      // Map roles
      const map: Record<string, string> = {};
      mappings.forEach((m: any) => {
        if (m.roles) {
          map[m.employee_id] = m.roles.name;
        }
      });
      setEmployeeRolesMap(map);

      if (usersData) {
        setEmployees(usersData);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAdding(true);
    setMessage("");

    try {
      const { data: newUser, error: userError } = await supabase
        .from("users")
        .insert([{ username: newUsername, password: newPassword, role: "employee" }])
        .select()
        .single();

      if (userError || !newUser) {
        setMessage("Error adding employee. Username might be taken.");
      } else {
        // Link to role
        try {
          if (selectedRoleId) {
            await supabase
              .from("employee_roles")
              .insert([{ employee_id: newUser.id, role_id: selectedRoleId }]);
          }
        } catch (roleErr) {
          console.error("Could not assign role to employee in database:", roleErr);
        }

        setMessage("Employee added successfully!");
        setNewUsername("");
        setNewPassword("");
        fetchEmployees(); // Refresh list
      }
    } catch (err) {
      setMessage("An unexpected error occurred.");
    }
    
    setIsAdding(false);
  };

  const initiateDelete = (id: string, username: string) => {
    setEmployeeToDelete({ id, username });
    setDeleteConfirmText("");
  };

  const confirmDelete = async () => {
    if (!employeeToDelete || deleteConfirmText.toLowerCase() !== "confirm") return;
    setIsDeleting(true);

    try {
      const { error } = await supabase
        .from("users")
        .delete()
        .eq("id", employeeToDelete.id);

      if (error) {
        setMessage(`Error deleting ${employeeToDelete.username}.`);
      } else {
        setMessage(`Employee ${employeeToDelete.username} removed.`);
        fetchEmployees(); // Refresh list
      }
    } catch (err) {
      setMessage("An unexpected error occurred.");
    }
    
    setEmployeeToDelete(null);
    setIsDeleting(false);
  };

  const handleLogout = () => {
    localStorage.removeItem("userRole");
    localStorage.removeItem("userName");
    router.push("/");
  };

  if (isLoading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="text-white">Loading...</div></div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-12 font-sans selection:bg-indigo-500/30 overflow-hidden relative">
      {/* Background gradients */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950 -z-10" />
      <div className="fixed -top-[20rem] -left-[20rem] w-[40rem] h-[40rem] bg-indigo-500/10 blur-[100px] rounded-full -z-10" />
      <div className="fixed -bottom-[20rem] -right-[20rem] w-[40rem] h-[40rem] bg-purple-500/10 blur-[100px] rounded-full -z-10" />
      
      <div className="max-w-7xl mx-auto space-y-8 relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-1000 ease-out">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-white/5 pb-6">
          <div>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 text-transparent bg-clip-text drop-shadow-sm pb-1">
              HR Management
            </h1>
            <p className="text-slate-400 mt-2 text-lg font-medium tracking-wide">
              Create and manage employee accounts & rules assignment
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Link 
              href="/admin"
              className="px-5 py-2.5 bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 border border-white/10 rounded-full shadow-inner backdrop-blur-md transition-colors text-sm font-semibold tracking-wide"
            >
              &larr; Back to Dashboard
            </Link>
            <button 
              onClick={handleLogout}
              className="px-5 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-full shadow-inner backdrop-blur-md transition-colors text-sm font-semibold tracking-wide"
            >
              Logout
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Add Employee Form */}
          <div className="relative group col-span-1">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500/30 to-purple-600/30 rounded-[2rem] blur opacity-50 transition duration-500"></div>
            <div className="relative bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-[2rem] shadow-2xl p-8">
              <h2 className="text-xl font-bold mb-6 text-indigo-300">Add New Hire</h2>
              
              <form onSubmit={handleAddEmployee} className="space-y-5">
                {message && (
                  <div className={`p-3 rounded-xl text-sm font-medium ${message.includes("Error") ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                    {message}
                  </div>
                )}
                
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Username / ID</label>
                  <input 
                    type="text" 
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-slate-800/50 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-white placeholder-slate-500 transition-all"
                    placeholder="e.g. jdoe"
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Password</label>
                  <input 
                    type="password" 
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-slate-800/50 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-white placeholder-slate-500 transition-all"
                    placeholder="Temporary password"
                  />
                </div>

                <div className="space-y-2 flex flex-col">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Functional Role Policy</label>
                  <Dropdown
                    options={roleOptions}
                    value={selectedRoleId}
                    onChange={setSelectedRoleId}
                    className="w-full"
                  />
                </div>

                <button 
                  type="submit"
                  disabled={isAdding}
                  className="w-full py-3 px-4 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white rounded-xl shadow-lg shadow-indigo-500/25 transition-all font-semibold tracking-wide disabled:opacity-50"
                >
                  {isAdding ? "Creating..." : "Create Account"}
                </button>
              </form>
            </div>
          </div>

          {/* Employee List */}
          <div className="relative group col-span-1 lg:col-span-2">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500/30 to-purple-600/30 rounded-[2rem] blur opacity-50 transition duration-500"></div>
            <div className="relative bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-[2rem] shadow-2xl overflow-hidden h-full">
              <div className="p-6 border-b border-white/5 bg-slate-800/30">
                <h2 className="text-xl font-bold text-slate-200">Active Employees</h2>
              </div>
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <table className="w-full text-sm text-left whitespace-nowrap">
                  <thead className="text-xs uppercase tracking-wider text-slate-400 bg-slate-800/50 sticky top-0">
                    <tr>
                      <th className="px-6 py-4 font-semibold">Username</th>
                      <th className="px-6 py-4 font-semibold">Password</th>
                      <th className="px-6 py-4 font-semibold">Role Policy</th>
                      <th className="px-6 py-4 font-semibold">Created</th>
                      <th className="px-6 py-4 font-semibold text-right">Status</th>
                      <th className="px-6 py-4 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {employees.map((emp) => {
                      const assignedRoleKey = employeeRolesMap[emp.id] || "role_1";
                      const assignedRoleName = FALLBACK_ROLES[assignedRoleKey]?.name || assignedRoleKey;
                      return (
                        <tr key={emp.id} className="hover:bg-white/[0.04] transition-colors group/row">
                          <td className="px-6 py-4 font-medium text-slate-200 flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs border border-indigo-500/30">
                              {emp.username.charAt(0).toUpperCase()}
                            </div>
                            {emp.username}
                          </td>
                          <td className="px-6 py-4 text-slate-400 font-mono text-xs">
                            {emp.password}
                          </td>
                          <td className="px-6 py-4 text-xs font-semibold text-indigo-400">
                            <span className="bg-indigo-500/10 px-2.5 py-1 rounded-full border border-indigo-500/20 uppercase tracking-wide font-bold">
                              {assignedRoleName}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-slate-500 text-xs">
                            {new Date(emp.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              Active
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => initiateDelete(emp.id, emp.username)}
                              className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all opacity-0 group-hover/row:opacity-100"
                              title="Delete Employee"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 6h18"></path>
                                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                              </svg>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {employees.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                          No employees found. Add one on the left!
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {employeeToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-rose-500/30 rounded-2xl p-8 w-full max-w-md shadow-2xl shadow-rose-900/20">
            <h3 className="text-xl font-bold text-rose-400 mb-2">Delete Employee</h3>
            <p className="text-slate-300 text-sm mb-6 leading-relaxed">
              This action cannot be undone. To permanently delete <strong className="text-white">{employeeToDelete.username}</strong>, please type <strong className="text-rose-400">confirm</strong> below.
            </p>
            
            <input 
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Type confirm here..."
              className="w-full px-4 py-3 bg-slate-950 border border-white/10 rounded-xl focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-white placeholder-slate-600 transition-all mb-6"
            />
            
            <div className="flex gap-3 justify-end">
              <button 
                onClick={() => setEmployeeToDelete(null)}
                className="px-5 py-2.5 text-sm font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button 
                onClick={confirmDelete}
                disabled={deleteConfirmText.toLowerCase() !== "confirm" || isDeleting}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-rose-500 hover:bg-rose-600 disabled:bg-rose-500/50 disabled:text-white/50 rounded-xl shadow-lg shadow-rose-500/20 transition-all"
              >
                {isDeleting ? "Deleting..." : "Permanently Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
