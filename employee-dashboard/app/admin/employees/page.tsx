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
  const [searchTerm, setSearchTerm] = useState("");
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

  const filteredEmployeesList = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return employees;
    return employees.filter(emp =>
      (emp.name || "").toLowerCase().includes(term) ||
      (emp.id || "").toLowerCase().includes(term) ||
      (emp.email || "").toLowerCase().includes(term) ||
      (emp.department || "").toLowerCase().includes(term)
    );
  }, [employees, searchTerm]);

  // Form State
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newEmpId, setNewEmpId] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newDeviceId, setNewDeviceId] = useState("");
  const [newDepartment, setNewDepartment] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [message, setMessage] = useState("");

  // Designation Form State
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDescription, setNewRoleDescription] = useState("");
  const [parentRoleId, setParentRoleId] = useState("");
  const [isAddingRole, setIsAddingRole] = useState(false);
  const [roleMessage, setRoleMessage] = useState("");

  // Delete Modal State
  const [employeeToDelete, setEmployeeToDelete] = useState<{ id: string, name: string, userId: string | null } | null>(null);
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
      // 1. Fetch from employees table
      const { data: empData, error: empError } = await supabase
        .from("employees")
        .select("*")
        .order("id", { ascending: true });

      if (empError) throw empError;

      // 2. Fetch from users table
      const { data: usersData, error: usersError } = await supabase
        .from("users")
        .select("*")
        .eq("role", "employee");

      if (usersError) throw usersError;

      // 3. Merge them
      const merged = empData.map((emp: any) => {
        const user = usersData.find((u: any) => 
          u.username.toLowerCase() === emp.name.toLowerCase() || 
          u.username.toLowerCase() === emp.id.toLowerCase()
        );
        return {
          ...emp,
          username: emp.name,
          password: user ? user.password : "(No login account)",
          userId: user ? user.id : null,
        };
      });

      setEmployees(merged);
    } catch (err) {
      console.error("Error fetching employees:", err);
    } finally {
      setIsLoading(false);
    }
  }

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAdding(true);
    setMessage("");

    const trimmedEmpId = newEmpId.trim();
    const trimmedUsername = newUsername.trim();
    const trimmedPassword = newPassword.trim();
    const trimmedEmail = newEmail.trim();
    const trimmedDeviceId = newDeviceId.trim() || "pc";
    const trimmedDepartment = newDepartment.trim() || "Engineering";

    try {
      // 1. Insert into employees table
      const { error: empError } = await supabase
        .from("employees")
        .insert([{
          id: trimmedEmpId,
          name: trimmedUsername,
          email: trimmedEmail,
          device_id: trimmedDeviceId,
          department: trimmedDepartment
        }]);

      if (empError) {
        setMessage(`Error adding employee profile: ${empError.message}`);
        setIsAdding(false);
        return;
      }

      // 2. Insert into users table
      const { error: userError } = await supabase
        .from("users")
        .insert([{
          username: trimmedUsername,
          password: trimmedPassword,
          role: "employee"
        }]);

      if (userError) {
        // Rollback employee insertion
        await supabase
          .from("employees")
          .delete()
          .eq("id", trimmedEmpId);
        setMessage(`Error creating login account: ${userError.message}`);
      } else {
        setMessage("Employee account created successfully!");
        setNewEmpId("");
        setNewUsername("");
        setNewPassword("");
        setNewEmail("");
        setNewDeviceId("");
        setNewDepartment("");
        fetchEmployees(); // Refresh list
      }
    } catch (err) {
      setMessage("An unexpected error occurred.");
    } finally {
      setIsAdding(false);
    }
  };

  const handleAddRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAddingRole(true);
    setRoleMessage("");

    // Slugify name for consistent role naming in classifier (e.g. "QA Engineer" -> "qa_engineer")
    const formattedName = newRoleName.trim().toLowerCase().replace(/\s+/g, "_");

    if (!formattedName) {
      setRoleMessage("Error: Designation name cannot be empty.");
      setIsAddingRole(false);
      return;
    }

    try {
      const { error } = await supabase
        .from("roles")
        .insert([{
          name: formattedName,
          description: newRoleDescription
        }]);

      if (error) {
        setRoleMessage(`Error: ${error.message} (Code: ${error.code || 'unknown'})`);
      } else {
        setRoleMessage("Designation created successfully!");
        setNewRoleName("");
        setNewRoleDescription("");
        await fetchRoles(); // Refresh designation options dropdowns immediately!
      }
    } catch (err) {
      setRoleMessage("An unexpected error occurred.");
    } finally {
      setIsAddingRole(false);
    }
  };

  const initiateDelete = (id: string, name: string, userId: string | null) => {
    setEmployeeToDelete({ id, name, userId });
    setDeleteConfirmText("");
  };

  const confirmDelete = async () => {
    if (!employeeToDelete || deleteConfirmText.toLowerCase() !== "confirm") return;
    setIsDeleting(true);

    try {
      // 1. Delete from employees table
      const { error: empError } = await supabase
        .from("employees")
        .delete()
        .eq("id", employeeToDelete.id);

      if (empError) {
        setMessage(`Error deleting employee profile: ${empError.message}`);
      } else {
        // 2. Delete from users table
        if (employeeToDelete.userId) {
          await supabase
            .from("users")
            .delete()
            .eq("id", employeeToDelete.userId);
        } else {
          await supabase
            .from("users")
            .delete()
            .eq("username", employeeToDelete.name);
        }
        setMessage(`Employee ${employeeToDelete.name} removed successfully.`);
        fetchEmployees(); // Refresh list
      }
    } catch (err) {
      setMessage("An unexpected error occurred.");
    } finally {
      setEmployeeToDelete(null);
      setIsDeleting(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("userRole");
    localStorage.removeItem("userName");
    router.push("/");
  };

  if (isLoading) return <div className="min-h-screen bg-[#0B1020] flex items-center justify-center"><div className="text-slate-300 text-sm font-medium tracking-wide">Loading...</div></div>;

  return (
    <div className="min-h-screen bg-[#0B1020] text-slate-100 p-6 md:p-8 font-sans selection:bg-blue-500/30 overflow-x-hidden relative">
      {/* Background flat canvas */}
      <div className="fixed inset-0 bg-[#0B1020] -z-10" />

      <div className="max-w-7xl mx-auto space-y-6 relative z-10">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-white/5 pb-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-100 pb-1">
              HR Management
            </h1>
            <p className="text-xs text-slate-400 mt-1 font-medium tracking-wide">
              Create and manage employee accounts & rules assignment
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="px-4 py-2 bg-slate-800/60 hover:bg-slate-700/60 text-slate-200 border border-white/5 rounded-lg transition-all text-xs font-medium cursor-pointer"
            >
              &larr; Back to Dashboard
            </Link>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-500/10 rounded-lg transition-all text-xs font-medium cursor-pointer"
            >
              Logout
            </button>
          </div>
        </header>

         <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          <div className="col-span-1 space-y-6">
            {/* Add Employee Form */}
            <div className="relative group">
              <div className="relative bg-[#121826] border border-white/5 rounded-[14px] shadow-sm p-6">
                <h2 className="text-sm font-semibold text-slate-200 tracking-wide mb-5">Add New Hire</h2>

                <form onSubmit={handleAddEmployee} className="space-y-4">
                  {message && (
                    <div className={`p-2.5 rounded-lg text-xs font-medium ${message.toLowerCase().includes("error") ? 'bg-rose-500/10 text-rose-400 border border-rose-500/10' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/10'}`}>
                      {message}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Employee ID</label>
                    <input
                      type="text"
                      value={newEmpId}
                      onChange={(e) => setNewEmpId(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-[#111827] border border-white/5 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs text-white placeholder-slate-500 transition-all"
                      placeholder="e.g. EMP009"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Full Name</label>
                    <input
                      type="text"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-[#111827] border border-white/5 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs text-white placeholder-slate-500 transition-all"
                      placeholder="e.g. Dhruv"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Email Address</label>
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-[#111827] border border-white/5 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs text-white placeholder-slate-500 transition-all"
                      placeholder="e.g. dhruv@company.com"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Password</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-[#111827] border border-white/5 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs text-white placeholder-slate-500 transition-all"
                      placeholder="Account login password"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Device ID</label>
                    <input
                      type="text"
                      value={newDeviceId}
                      onChange={(e) => setNewDeviceId(e.target.value)}
                      className="w-full px-3 py-2 bg-[#111827] border border-white/5 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs text-white placeholder-slate-500 transition-all"
                      placeholder="e.g. pc (Default: pc)"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Department / Designation</label>
                    <input
                      type="text"
                      value={newDepartment}
                      onChange={(e) => setNewDepartment(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-[#111827] border border-white/5 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs text-white placeholder-slate-500 transition-all"
                      placeholder="e.g. Engineering"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isAdding}
                    className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-all text-xs font-medium disabled:opacity-50 cursor-pointer"
                  >
                    {isAdding ? "Creating Profile..." : "Add Employee"}
                  </button>
                </form>
              </div>
            </div>

            {/* Add New Designation Form */}
            <div className="relative group">
              <div className="relative bg-[#121826] border border-white/5 rounded-[14px] shadow-sm p-6">
                <h2 className="text-sm font-semibold text-slate-200 tracking-wide mb-5">Add New Designation</h2>

                <form onSubmit={handleAddRole} className="space-y-4">
                  {roleMessage && (
                    <div className={`p-2.5 rounded-lg text-xs font-medium ${roleMessage.includes("Error") ? 'bg-rose-500/10 text-rose-400 border border-rose-500/10' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/10'}`}>
                      {roleMessage}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Designation Name</label>
                    <input
                      type="text"
                      value={newRoleName}
                      onChange={(e) => setNewRoleName(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-[#111827] border border-white/5 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs text-white placeholder-slate-500 transition-all"
                      placeholder="e.g. QA Engineer"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Description</label>
                    <textarea
                      value={newRoleDescription}
                      onChange={(e) => setNewRoleDescription(e.target.value)}
                      className="w-full px-3 py-2 bg-[#111827] border border-white/5 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs text-white placeholder-slate-500 transition-all h-20 resize-none"
                      placeholder="Brief description..."
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isAddingRole}
                    className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-all text-xs font-medium disabled:opacity-50 cursor-pointer"
                  >
                    {isAddingRole ? "Creating..." : "Create Designation"}
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* Employee List */}
          <div className="relative group col-span-1 lg:col-span-2">
            <div className="relative bg-[#121826] border border-white/5 rounded-[14px] shadow-sm overflow-hidden h-full">
              <div className="p-5 border-b border-white/5 bg-[#111827]/80 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <h2 className="text-sm font-semibold text-slate-200 tracking-wide">Active Employees</h2>
                <div className="relative w-48">
                  <input
                    type="text"
                    placeholder="Search employee..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-[#121826] border border-white/5 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs transition-all"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs focus:outline-none cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <table className="w-full text-sm text-left whitespace-nowrap">
                  <thead className="text-[11px] uppercase tracking-wider text-slate-400 bg-[#111827]/80 sticky top-0 border-b border-white/5">
                    <tr>
                      <th className="px-6 py-3 font-semibold">Emp ID</th>
                      <th className="px-6 py-3 font-semibold">Name</th>
                      <th className="px-6 py-3 font-semibold">Email</th>
                      <th className="px-6 py-3 font-semibold">Department</th>
                      <th className="px-6 py-3 font-semibold">Device ID</th>
                      <th className="px-6 py-3 font-semibold">Password</th>
                      <th className="px-6 py-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredEmployeesList.map((emp) => {
                      return (
                        <tr key={emp.id} className="hover:bg-white/[0.02] transition-colors group/row">
                          <td className="px-6 py-3 font-mono text-xs text-blue-400">
                            {emp.id}
                          </td>
                          <td className="px-6 py-3 font-medium text-slate-200 flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center font-semibold text-xs border border-blue-500/20">
                              {emp.name.charAt(0).toUpperCase()}
                            </div>
                            {emp.name}
                          </td>
                          <td className="px-6 py-3 text-slate-300 text-xs">
                            {emp.email || "-"}
                          </td>
                          <td className="px-6 py-3">
                            <span className="bg-[#111827] px-2 py-0.5 border border-white/5 rounded-md text-[10px] text-slate-300 font-semibold uppercase tracking-wider">
                              {emp.department || "Engineering"}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-slate-400 font-mono text-xs">
                            {emp.device_id || "pc"}
                          </td>
                          <td className="px-6 py-3 text-slate-400 font-mono text-xs">
                            {emp.password}
                          </td>
                          <td className="px-6 py-3 text-right">
                            <button
                              onClick={() => initiateDelete(emp.id, emp.name, emp.userId)}
                              className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all opacity-0 group-hover/row:opacity-100 cursor-pointer"
                              title="Delete Employee"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 6h18"></path>
                                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                              </svg>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredEmployeesList.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-slate-500 text-xs">
                          {searchTerm ? "No matching employees found." : "No employees found. Add one on the left!"}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

        </div>

        {/* Delete Confirmation Modal */}
        {employeeToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-[#121826] border border-white/5 rounded-[14px] p-6 w-full max-w-md shadow-lg animate-in fade-in duration-200">
              <h3 className="text-base font-semibold text-rose-400 mb-2">Delete Employee</h3>
              <p className="text-slate-400 text-xs mb-5 leading-relaxed">
                This action cannot be undone. To permanently delete <strong className="text-slate-200">{employeeToDelete.name} ({employeeToDelete.id})</strong>, please type <strong className="text-rose-400 font-semibold">confirm</strong> below.
              </p>

              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Type confirm here..."
                className="w-full px-3 py-2 bg-[#111827] border border-white/5 rounded-lg focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-xs text-white placeholder-slate-600 transition-all mb-5"
              />

              <div className="flex gap-2.5 justify-end">
                <button
                  onClick={() => setEmployeeToDelete(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-white/5 rounded-lg transition-colors"
                  disabled={isDeleting}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={deleteConfirmText.toLowerCase() !== "confirm" || isDeleting}
                  className="px-4 py-2 text-xs font-medium text-white bg-rose-600 hover:bg-rose-500 disabled:bg-rose-500/50 disabled:text-white/50 rounded-lg transition-all"
                >
                  {isDeleting ? "Deleting..." : "Permanently Delete"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

