import { useAuth } from "@/lib/auth";
import { useGetDashboardStats } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, UserCheck, UserX, Clock, TrendingUp, AlertCircle } from "lucide-react";

export default function Dashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === "super_admin" || user?.role === "admin" || user?.role === "hr";
  
  const { data: stats, isLoading } = useGetDashboardStats();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Welcome back, {user?.name}</h1>
        <p className="text-gray-500">Here's what's happening today.</p>
      </div>

      {isAdmin && (
        <>
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {[1,2,3,4].map(i => <Skeleton key={i} className="h-32 w-full" />)}
            </div>
          ) : stats ? (
            <>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.totalEmployees}</div>
                    <p className="text-xs text-muted-foreground">Active workforce</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Present Today</CardTitle>
                    <UserCheck className="h-4 w-4 text-green-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">{stats.presentToday}</div>
                    <p className="text-xs text-muted-foreground">{stats.attendanceRate}% attendance rate</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Absent / On Leave</CardTitle>
                    <UserX className="h-4 w-4 text-amber-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-amber-600">{stats.absentToday} / {stats.onLeaveToday}</div>
                    <p className="text-xs text-muted-foreground">Absent / on leave</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Pending Leaves</CardTitle>
                    <AlertCircle className="h-4 w-4 text-blue-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-blue-600">{stats.pendingLeaves}</div>
                    <p className="text-xs text-muted-foreground">Awaiting approval</p>
                  </CardContent>
                </Card>
              </div>

              {stats.payrollThisMonth !== undefined && (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Monthly Payroll</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">PKR {stats.payrollThisMonth?.toLocaleString()}</div>
                    <p className="text-xs text-muted-foreground">Total net salary this month</p>
                  </CardContent>
                </Card>
              )}

              {stats.pendingLeaveRequests && stats.pendingLeaveRequests.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Recent Leave Requests</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {stats.pendingLeaveRequests.map((lr) => (
                        <div key={lr.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                          <div>
                            <p className="text-sm font-medium">{lr.employeeName || `Employee #${lr.employeeId}`}</p>
                            <p className="text-xs text-gray-500">{lr.startDate} → {lr.endDate} ({lr.totalDays} days)</p>
                          </div>
                          <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-full">Pending</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : null}
        </>
      )}
      
      {user?.role === "employee" && (
        <Card>
          <CardHeader>
            <CardTitle>Your Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-500">Use the sidebar to view your attendance, leave balance, and payslips.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
