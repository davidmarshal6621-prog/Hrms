import { useAuth } from "@/lib/auth";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Users, CalendarCheck, FileText, DollarSign,
  Building2, GitBranch, Clock, UserCog, Cpu, ChevronRight,
  ScanLine, Settings, ListFilter,
} from "lucide-react";

function NavLink({ href, icon: Icon, children }: { href: string; icon: any; children: React.ReactNode }) {
  const [location] = useLocation();
  const isActive = location === href || (href !== "/dashboard" && location.startsWith(href));

  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          : "hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{children}</span>
      {isActive && <ChevronRight className="h-3 w-3 ml-auto opacity-60" />}
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-4 pb-1 px-3 text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-wider">
      {children}
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();

  const handleLogout = () => {
    logout();
    setLocation("/login");
  };

  const isAdmin = user?.role === "super_admin" || user?.role === "admin";
  const isAdminOrHr = isAdmin || user?.role === "hr";

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 bg-sidebar border-r border-sidebar-border text-sidebar-foreground flex flex-col shrink-0">
        {/* Logo */}
        <div className="p-4 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm">E</div>
            <div>
              <div className="font-bold text-sm leading-tight">EMS Portal</div>
              <div className="text-xs text-sidebar-foreground/50">Employee Management</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          <NavLink href="/dashboard" icon={LayoutDashboard}>Dashboard</NavLink>

          {/* Workforce */}
          {isAdminOrHr && (
            <>
              <SectionLabel>Workforce</SectionLabel>
              <NavLink href="/employees" icon={Users}>Employees</NavLink>
            </>
          )}

          {/* Daily */}
          <SectionLabel>Daily</SectionLabel>
          <NavLink href="/attendance" icon={CalendarCheck}>Attendance</NavLink>
          {isAdminOrHr && (
            <NavLink href="/attendance/punch-logs" icon={ScanLine}>Punch Logs</NavLink>
          )}
          <NavLink href="/leaves" icon={FileText}>Leave Requests</NavLink>

          {/* Finance */}
          {isAdminOrHr && (
            <>
              <SectionLabel>Finance</SectionLabel>
              <NavLink href="/payroll" icon={DollarSign}>Payroll</NavLink>
            </>
          )}

          {/* Configuration */}
          {isAdminOrHr && (
            <>
              <SectionLabel>Configuration</SectionLabel>
              <NavLink href="/departments" icon={Building2}>Departments</NavLink>
              {isAdmin && (
                <>
                  <NavLink href="/branches" icon={GitBranch}>Branches</NavLink>
                  <NavLink href="/shifts" icon={Clock}>Shifts</NavLink>
                  <NavLink href="/users" icon={UserCog}>Users</NavLink>
                  <NavLink href="/devices" icon={Cpu}>ZKTeco Devices</NavLink>
                </>
              )}
            </>
          )}

          {/* Settings */}
          {isAdmin && (
            <>
              <SectionLabel>Settings</SectionLabel>
              <NavLink href="/settings/company" icon={Settings}>Company Settings</NavLink>
            </>
          )}
        </nav>

        {/* User footer */}
        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm shrink-0">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{user?.name}</div>
              <div className="text-xs text-sidebar-foreground/60 truncate capitalize">{user?.role?.replace(/_/g, " ")}</div>
            </div>
          </div>
          <Button variant="secondary" size="sm" className="w-full justify-center" onClick={handleLogout}>
            Sign Out
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <main className="flex-1 overflow-auto p-6 md:p-8 bg-gray-50">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
