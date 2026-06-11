import { useAuth } from "@/lib/auth";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();

  const handleLogout = () => {
    logout();
    setLocation("/login");
  };

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 bg-sidebar border-r border-sidebar-border text-sidebar-foreground flex flex-col">
        <div className="p-4 font-bold text-lg border-b border-sidebar-border flex items-center justify-between">
          <span>EMS Platform</span>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <Link href="/dashboard" className="block px-3 py-2 rounded-md hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors">
            Dashboard
          </Link>
          {user?.role !== "employee" && (
            <Link href="/employees" className="block px-3 py-2 rounded-md hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors">
              Employees
            </Link>
          )}
          <Link href="/attendance" className="block px-3 py-2 rounded-md hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors">
            Attendance
          </Link>
          <Link href="/leaves" className="block px-3 py-2 rounded-md hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors">
            Leaves
          </Link>
          {user?.role !== "employee" && user?.role !== "manager" && (
            <Link href="/payroll" className="block px-3 py-2 rounded-md hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors">
              Payroll
            </Link>
          )}
          
          {(user?.role === "super_admin" || user?.role === "admin" || user?.role === "hr") && (
            <>
              <div className="pt-4 pb-2 px-3 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">
                Configuration
              </div>
              <Link href="/departments" className="block px-3 py-2 rounded-md hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors">
                Departments
              </Link>
              {(user?.role === "super_admin" || user?.role === "admin") && (
                <>
                  <Link href="/branches" className="block px-3 py-2 rounded-md hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors">
                    Branches
                  </Link>
                  <Link href="/shifts" className="block px-3 py-2 rounded-md hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors">
                    Shifts
                  </Link>
                  <Link href="/users" className="block px-3 py-2 rounded-md hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors">
                    Users
                  </Link>
                </>
              )}
            </>
          )}
        </nav>
        <div className="p-4 border-t border-sidebar-border bg-sidebar-accent/30">
          <div className="text-sm font-medium truncate">{user?.name}</div>
          <div className="text-xs text-sidebar-foreground/70 truncate capitalize mb-3">{user?.role?.replace("_", " ")}</div>
          <Button variant="secondary" className="w-full justify-start text-left" onClick={handleLogout}>
            Sign Out
          </Button>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white">
        <main className="flex-1 overflow-auto p-6 md:p-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
