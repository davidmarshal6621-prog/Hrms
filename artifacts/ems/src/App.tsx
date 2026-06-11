import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { AppLayout } from "@/components/layout/app-layout";
import { useEffect } from "react";

import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import EmployeesList from "@/pages/employees/index";
import NewEmployee from "@/pages/employees/new";
import EmployeeProfile from "@/pages/employees/profile";
import AttendanceList from "@/pages/attendance/index";
import LeavesList from "@/pages/leaves/index";
import NewLeave from "@/pages/leaves/new";
import PayrollList from "@/pages/payroll/index";
import DepartmentsList from "@/pages/departments/index";
import BranchesList from "@/pages/branches/index";
import ShiftsList from "@/pages/shifts/index";
import UsersList from "@/pages/users/index";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function ProtectedRoute({ component: Component, ...rest }: any) {
  const { isAuthenticated } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (!isAuthenticated && location !== "/login") {
      setLocation("/login");
    }
  }, [isAuthenticated, location, setLocation]);

  if (!isAuthenticated) return null;

  return (
    <AppLayout>
      <Component {...rest} />
    </AppLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/" component={() => {
        const [, setLocation] = useLocation();
        useEffect(() => setLocation("/dashboard"), []);
        return null;
      }} />
      <Route path="/dashboard"><ProtectedRoute component={Dashboard} /></Route>
      
      <Route path="/employees"><ProtectedRoute component={EmployeesList} /></Route>
      <Route path="/employees/new"><ProtectedRoute component={NewEmployee} /></Route>
      <Route path="/employees/:id"><ProtectedRoute component={EmployeeProfile} /></Route>
      
      <Route path="/attendance"><ProtectedRoute component={AttendanceList} /></Route>
      
      <Route path="/leaves"><ProtectedRoute component={LeavesList} /></Route>
      <Route path="/leaves/new"><ProtectedRoute component={NewLeave} /></Route>
      
      <Route path="/payroll"><ProtectedRoute component={PayrollList} /></Route>

      <Route path="/departments"><ProtectedRoute component={DepartmentsList} /></Route>
      <Route path="/branches"><ProtectedRoute component={BranchesList} /></Route>
      <Route path="/shifts"><ProtectedRoute component={ShiftsList} /></Route>
      <Route path="/users"><ProtectedRoute component={UsersList} /></Route>
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
