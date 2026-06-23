import { useState, useEffect } from "react";
import { useUserStore } from "../services/userStore";
import {
  fetchAdminUsers,
  updateAdminUser,
  deleteAdminUser,
  fetchAdminCreditLogs
} from "../services/api";

export const AdminDashboard = ({ onClose, theme }) => {
  const currentUser = useUserStore((state) => state.user);
  
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [activeTab, setActiveTab] = useState("users"); // 'users' or 'logs'
  const [userSearch, setUserSearch] = useState("");
  const [logSearch, setLogSearch] = useState("");
  
  // Edit Modal State
  const [editingUser, setEditingUser] = useState(null);
  const [editRole, setEditRole] = useState("linguist");
  const [editStatus, setEditStatus] = useState("active");
  const [editCreditsAllowed, setEditCreditsAllowed] = useState(50000);
  const [editTranslateAccess, setEditTranslateAccess] = useState(true);
  const [submittingEdit, setSubmittingEdit] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");
      
      const [usersData, logsData] = await Promise.all([
        fetchAdminUsers(),
        fetchAdminCreditLogs()
      ]);
      
      setUsers(usersData.users || []);
      setLogs(logsData.logs || []);
    } catch (err) {
      console.error(err);
      const serverErr = err.response?.data?.error;
      const errorText = typeof serverErr === "object" && serverErr !== null
        ? (serverErr.message || JSON.stringify(serverErr))
        : (serverErr || err.message || "Failed to load administrative data");
      setError(errorText);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (msg, isError = false) => {
    let formattedMsg = msg;
    if (typeof msg === "object" && msg !== null) {
      formattedMsg = msg.message || JSON.stringify(msg);
    }
    if (isError) {
      setError(formattedMsg);
      setTimeout(() => setError(""), 4000);
    } else {
      setSuccess(formattedMsg);
      setTimeout(() => setSuccess(""), 3000);
    }
  };

  const handleToggleTranslate = async (user) => {
    try {
      const updatedAccess = !user.has_translate_access;
      await updateAdminUser(user.id, { has_translate_access: updatedAccess });
      setUsers(prev => 
        prev.map(u => u.id === user.id ? { ...u, has_translate_access: updatedAccess } : u)
      );
      showToast(`Translation access ${updatedAccess ? "enabled" : "disabled"} for ${user.email}`);
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.error || "Failed to update translation access", true);
    }
  };

  const handleDeleteUser = async (userId, userEmail) => {
    if (!window.confirm(`Are you absolutely sure you want to delete the user account for ${userEmail}? This action cannot be undone.`)) {
      return;
    }
    
    try {
      await deleteAdminUser(userId);
      setUsers(prev => prev.filter(u => u.id !== userId));
      showToast(`Successfully deleted user account: ${userEmail}`);
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.error || "Failed to delete user account", true);
    }
  };

  const handleOpenEdit = (user) => {
    setEditingUser(user);
    setEditRole(user.role);
    setEditStatus(user.status);
    setEditCreditsAllowed(user.credits_allowed);
    setEditTranslateAccess(user.has_translate_access);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingUser) return;
    
    try {
      setSubmittingEdit(true);
      const payload = {
        role: editRole,
        status: editStatus,
        credits_allowed: Number(editCreditsAllowed),
        has_translate_access: editTranslateAccess
      };
      
      await updateAdminUser(editingUser.id, payload);
      
      setUsers(prev =>
        prev.map(u => u.id === editingUser.id ? { ...u, ...payload } : u)
      );
      
      setEditingUser(null);
      showToast(`User settings updated for ${editingUser.email}`);
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.error || "Failed to update user profile", true);
    } finally {
      setSubmittingEdit(false);
    }
  };

  // Metrics Calculations
  const totalUsers = users.length;
  const totalCreditsUsed = users.reduce((sum, u) => sum + (u.credits_consumed || 0), 0);
  const activeTranslators = users.filter(u => u.status === "active" && u.has_translate_access).length;
  const totalLogs = logs.length;

  // Filters
  const filteredUsers = users.filter(u => 
    u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.role.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.status.toLowerCase().includes(userSearch.toLowerCase())
  );

  const filteredLogs = logs.filter(l => 
    l.email.toLowerCase().includes(logSearch.toLowerCase()) ||
    (l.file_name && l.file_name.toLowerCase().includes(logSearch.toLowerCase())) ||
    l.action.toLowerCase().includes(logSearch.toLowerCase())
  );

  const isAdmin = currentUser?.role === "admin";

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-[#05070c]/95 backdrop-blur-xl text-slate-100 overflow-hidden font-sans">
      
      {/* Header Bar */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-900/50 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/20">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
              <line x1="15" y1="3" x2="15" y2="21" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight text-white">VerboCat Admin Center</h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
              Access level: <span className="text-indigo-400 font-black">{currentUser?.role}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={loadData}
            className="flex items-center gap-2 rounded-xl bg-white/5 hover:bg-white/10 px-4 py-2 text-xs font-bold transition-all border border-white/5 cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
            Refresh
          </button>
          
          <button 
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-600/10 hover:bg-rose-600/20 border border-rose-500/20 text-rose-400 transition-all cursor-pointer"
            title="Close Dashboard"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 overflow-y-auto p-6 max-w-7xl w-full mx-auto space-y-6">
        
        {/* Banner Messages */}
        {error && (
          <div className="rounded-2xl bg-rose-500/10 py-3.5 px-5 text-sm font-semibold text-rose-400 border border-rose-500/20 shadow-lg animate-fade-in flex items-center gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-2xl bg-emerald-500/10 py-3.5 px-5 text-sm font-semibold text-emerald-400 border border-emerald-500/20 shadow-lg animate-fade-in flex items-center gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            {success}
          </div>
        )}

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-4 backdrop-blur-md">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Total Users</span>
            <div className="text-2xl font-black text-white mt-1">{loading ? "..." : totalUsers}</div>
            <span className="text-[9px] text-slate-400 font-semibold block mt-1">Registered in database</span>
          </div>

          <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-4 backdrop-blur-md">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Credits Consumed</span>
            <div className="text-2xl font-black text-indigo-400 mt-1">{loading ? "..." : totalCreditsUsed.toLocaleString()}</div>
            <span className="text-[9px] text-slate-400 font-semibold block mt-1">Words translated globally</span>
          </div>

          <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-4 backdrop-blur-md">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Active Translators</span>
            <div className="text-2xl font-black text-emerald-400 mt-1">{loading ? "..." : activeTranslators}</div>
            <span className="text-[9px] text-slate-400 font-semibold block mt-1">Users authorized to translate</span>
          </div>

          <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-4 backdrop-blur-md">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Global Log Events</span>
            <div className="text-2xl font-black text-sky-400 mt-1">{loading ? "..." : totalLogs}</div>
            <span className="text-[9px] text-slate-400 font-semibold block mt-1">Audit logs generated</span>
          </div>
        </div>

        {/* Tabs and Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex gap-2 bg-slate-950/40 p-1.5 rounded-2xl border border-white/5 w-fit">
            <button
              onClick={() => setActiveTab("users")}
              className={`px-4 py-2 rounded-xl text-xs font-black tracking-wide transition-all cursor-pointer ${
                activeTab === "users" 
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/15" 
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              User Accounts
            </button>
            <button
              onClick={() => setActiveTab("logs")}
              className={`px-4 py-2 rounded-xl text-xs font-black tracking-wide transition-all cursor-pointer ${
                activeTab === "logs" 
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/15" 
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Credit Logs Audit
            </button>
          </div>

          {/* Search Fields */}
          <div className="relative w-full sm:max-w-xs">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </span>
            {activeTab === "users" ? (
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search email, role, status..."
                className="w-full pl-9 rounded-xl border border-white/10 bg-black/30 py-2.5 text-xs text-slate-200 placeholder:text-slate-600 outline-none focus:border-indigo-500/50 focus:bg-black/50 transition-all"
              />
            ) : (
              <input
                type="text"
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                placeholder="Search email, action, file name..."
                className="w-full pl-9 rounded-xl border border-white/10 bg-black/30 py-2.5 text-xs text-slate-200 placeholder:text-slate-600 outline-none focus:border-indigo-500/50 focus:bg-black/50 transition-all"
              />
            )}
          </div>
        </div>

        {/* Tab Contents */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <svg className="animate-spin h-8 w-8 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Syncing database data...</p>
          </div>
        ) : activeTab === "users" ? (
          
          /* User Accounts Tab */
          <div className="overflow-x-auto rounded-2xl border border-white/5 bg-slate-900/10 shadow-xl backdrop-blur-md">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5 bg-slate-950/40 text-[10px] font-bold text-slate-500 uppercase tracking-widest select-none">
                  <th className="px-6 py-4">User Account</th>
                  <th className="px-4 py-4">Role Badge</th>
                  <th className="px-4 py-4">Status</th>
                  <th className="px-4 py-4">Credit Allowance Usage</th>
                  <th className="px-4 py-4 text-center">Translate Access</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs text-slate-300">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-6 py-10 text-center font-bold text-slate-600 uppercase tracking-wider">
                      No matching user profiles found
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => {
                    const usagePercent = Math.min(Math.round((user.credits_consumed / user.credits_allowed) * 100), 100);
                    const isCurrentUser = user.id === currentUser?.id;
                    
                    return (
                      <tr key={user.id} className="hover:bg-white/[0.02] transition-colors">
                        
                        {/* Email / ID */}
                        <td className="px-6 py-4 font-semibold text-slate-100">
                          <div className="flex items-center gap-2">
                            <span>{user.email}</span>
                            {isCurrentUser && (
                              <span className="px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase bg-indigo-500/15 text-indigo-400 border border-indigo-500/25">
                                You
                              </span>
                            )}
                          </div>
                          <span className="block text-[9px] text-slate-600 font-mono mt-0.5 select-none">{user.id}</span>
                        </td>

                        {/* Role Badge */}
                        <td className="px-4 py-4">
                          <span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
                             user.role === "admin" ? "bg-rose-500/10 border border-rose-500/20 text-rose-400" :
                             user.role === "verbolabs_staff" ? "bg-sky-500/10 border border-sky-500/20 text-sky-400" :
                             "bg-slate-500/15 border border-white/5 text-slate-400"
                          }`}>
                            {user.role.replace("_", " ")}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-4">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-bold ${
                            user.status === "active" ? "text-emerald-400" : "text-rose-400"
                          }`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${user.status === "active" ? "bg-emerald-400 animate-pulse" : "bg-rose-400"}`} />
                            {user.status}
                          </span>
                        </td>

                        {/* Credit Usage Progress */}
                        <td className="px-4 py-4 max-w-[200px]">
                          <div className="space-y-1">
                            <div className="flex justify-between font-mono text-[9px] text-slate-500 font-bold select-none">
                              <span>{user.credits_consumed.toLocaleString()} / {user.credits_allowed.toLocaleString()} words</span>
                              <span>{usagePercent}%</span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-950/60 rounded-full overflow-hidden border border-white/5">
                              <div 
                                className={`h-full rounded-full transition-all duration-300 ${
                                  user.credits_consumed >= user.credits_allowed ? "bg-rose-500" :
                                  usagePercent > 80 ? "bg-amber-500" : "bg-indigo-500"
                                }`}
                                style={{ width: `${usagePercent}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Toggle Translate Access */}
                        <td className="px-4 py-4 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleTranslate(user)}
                            disabled={isCurrentUser || user.role === "admin"}
                            className="inline-flex focus:outline-none disabled:opacity-40 transition-all select-none cursor-pointer"
                          >
                            {user.has_translate_access ? (
                              <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-lg">
                                Allowed
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-[10px] text-rose-400 font-bold bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-lg">
                                Blocked
                              </span>
                            )}
                          </button>
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-4 text-right select-none">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => handleOpenEdit(user)}
                              className="rounded-lg p-1.5 border border-white/5 bg-slate-950/20 hover:bg-slate-950/40 text-slate-400 hover:text-white transition-all cursor-pointer"
                              title="Edit User Settings"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                            </button>
                            
                            {isAdmin && !isCurrentUser && (
                              <button
                                onClick={() => handleDeleteUser(user.id, user.email)}
                                className="rounded-lg p-1.5 border border-rose-500/10 bg-rose-500/5 hover:bg-rose-500/15 text-rose-400 hover:text-rose-300 transition-all cursor-pointer"
                                title="Delete User Account"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                              </button>
                            )}
                          </div>
                        </td>

                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          
          /* Credit Logs Tab */
          <div className="overflow-x-auto rounded-2xl border border-white/5 bg-slate-900/10 shadow-xl backdrop-blur-md">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5 bg-slate-950/40 text-[10px] font-bold text-slate-500 uppercase tracking-widest select-none">
                  <th className="px-6 py-4">Timestamp</th>
                  <th className="px-6 py-4">User Account</th>
                  <th className="px-4 py-4">Operation</th>
                  <th className="px-6 py-4">Resource Target (File)</th>
                  <th className="px-6 py-4 text-right">Words Deducted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs text-slate-300 font-mono">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-6 py-10 text-center font-sans font-bold text-slate-600 uppercase tracking-wider">
                      No matching log events recorded
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => {
                    const logDate = new Date(log.created_at).toLocaleString();
                    
                    return (
                      <tr key={log.id} className="hover:bg-white/[0.01] transition-colors">
                        <td className="px-6 py-3.5 text-slate-500 font-semibold select-none">{logDate}</td>
                        <td className="px-6 py-3.5 font-sans font-bold text-slate-200">{log.email}</td>
                        <td className="px-4 py-3.5">
                          <span className="inline-flex rounded-md bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 text-[10px] font-bold text-indigo-400 capitalize font-sans">
                            {log.action.replace("-", " ")}
                          </span>
                        </td>
                        <td className="px-6 py-3.5 text-slate-400 max-w-[250px] truncate" title={log.file_name || "N/A"}>
                          {log.file_name || <span className="text-slate-600 select-none">N/A</span>}
                        </td>
                        <td className="px-6 py-3.5 text-right font-bold text-indigo-400">
                          {log.word_count > 0 ? `-${log.word_count.toLocaleString()}` : "0"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

      </main>

      {/* Edit User Modal Overlay */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 transition-all duration-300 animate-fade-in">
          <div className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-white/10 bg-slate-900 p-7 shadow-2xl">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-white/5 mb-5">
              <div>
                <h3 className="text-base font-black text-white">Adjust User Permissions</h3>
                <span className="text-[10px] text-slate-400 block font-bold mt-0.5">{editingUser.email}</span>
              </div>
              <button
                onClick={() => setEditingUser(null)}
                className="rounded-lg p-1.5 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              
              {/* Role Option (Admin Only) */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 select-none">
                  User Role Badge {!isAdmin && <span className="text-[9px] text-rose-400/80 font-bold lowercase tracking-normal">(Admin permission required)</span>}
                </label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  disabled={!isAdmin}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-slate-100 outline-none transition-all focus:border-indigo-500/50 disabled:opacity-50 text-sm cursor-pointer"
                >
                   <option value="linguist">Linguist</option>
                   <option value="verbolabs_staff">VerboLabs Staff</option>
                   <option value="admin">Administrator</option>
                </select>
              </div>

              {/* Status Option (Admin Only) */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 select-none">
                  Account Status {!isAdmin && <span className="text-[9px] text-rose-400/80 font-bold lowercase tracking-normal">(Admin permission required)</span>}
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  disabled={!isAdmin}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-slate-100 outline-none transition-all focus:border-indigo-500/50 disabled:opacity-50 text-sm cursor-pointer"
                >
                  <option value="active">Active (Access Allowed)</option>
                  <option value="suspended">Suspended (Blocked from App)</option>
                </select>
              </div>

              {/* Credit Limit Allowance */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 select-none">
                  Word Credit Limit Allowance
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  value={editCreditsAllowed}
                  onChange={(e) => setEditCreditsAllowed(e.target.value)}
                  placeholder="e.g. 50000"
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-slate-100 outline-none transition-all focus:border-indigo-500/50 text-sm"
                />
              </div>

              {/* Translate Access Option */}
              <div className="flex items-center gap-3 pt-1">
                <input
                  type="checkbox"
                  id="translate-access"
                  checked={editTranslateAccess}
                  onChange={(e) => setEditTranslateAccess(e.target.checked)}
                  disabled={editingUser.role === "admin"}
                  className="h-4 w-4 rounded border-white/10 bg-black/40 text-indigo-600 focus:ring-indigo-500/20 outline-none cursor-pointer"
                />
                <label htmlFor="translate-access" className="text-xs font-bold text-slate-300 select-none cursor-pointer">
                  Authorize "Pre-Translate" Button Actions
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-3 border-t border-white/5 mt-5">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingEdit}
                  className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-indigo-500/15 transition-all hover:from-indigo-500 hover:to-violet-500 cursor-pointer"
                >
                  {submittingEdit ? (
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : "Save Changes"}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
};
