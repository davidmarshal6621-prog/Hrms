import { useParams, Link } from "wouter";
import { useGetEmployee, useListAttendance } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, MapPin, Building, Clock, Phone, Mail, FileText } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function EmployeeProfile() {
  const { id } = useParams();
  const empId = id ? parseInt(id) : 0;
  
  const { data: employee, isLoading: empLoading } = useGetEmployee(empId);

  const { data: attendance, isLoading: attLoading } = useListAttendance(
    { employeeId: empId }
  );

  if (empLoading) {
    return <div className="p-8 space-y-4"><Skeleton className="h-12 w-1/3"/><Skeleton className="h-64 w-full"/></div>;
  }

  if (!employee) return <div>Employee not found</div>;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/employees">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{employee.firstName} {employee.lastName}</h1>
            <p className="text-sm text-gray-500">{employee.employeeCode} • {employee.designation || "No Designation"}</p>
          </div>
        </div>
        <Badge variant={employee.status === "active" ? "default" : "secondary"} className={employee.status === "active" ? "bg-green-100 text-green-800" : ""}>
          {employee.status}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 space-y-4">
            <h3 className="font-semibold border-b pb-2">Contact Info</h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400">
                <Mail className="h-4 w-4" /> <span>{employee.email || "N/A"}</span>
              </div>
              <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400">
                <Phone className="h-4 w-4" /> <span>{employee.phone || "N/A"}</span>
              </div>
              <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400">
                <FileText className="h-4 w-4" /> <span>CNIC: {employee.cnic || "N/A"}</span>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 space-y-4">
            <h3 className="font-semibold border-b pb-2">Employment Details</h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400">
                <Building className="h-4 w-4" /> <span>{employee.departmentName || "No Department"}</span>
              </div>
              <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400">
                <MapPin className="h-4 w-4" /> <span>{employee.branchName || "No Branch"}</span>
              </div>
              <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400">
                <Clock className="h-4 w-4" /> <span>{employee.shiftName || "No Shift Assigned"}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="md:col-span-2">
          <Tabs defaultValue="attendance" className="w-full">
            <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent">
              <TabsTrigger value="attendance" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none data-[state=active]:bg-transparent pb-3 pt-2">Recent Attendance</TabsTrigger>
              <TabsTrigger value="payroll" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none data-[state=active]:bg-transparent pb-3 pt-2">Payroll & Salary</TabsTrigger>
            </TabsList>
            
            <TabsContent value="attendance" className="pt-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <Table>
                  <TableHeader className="bg-gray-50 dark:bg-gray-900/50">
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Check In</TableHead>
                      <TableHead>Check Out</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {attLoading ? (
                      <TableRow><TableCell colSpan={4}><Skeleton className="h-10 w-full"/></TableCell></TableRow>
                    ) : attendance?.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center text-gray-500 py-8">No attendance records.</TableCell></TableRow>
                    ) : (
                      attendance?.slice(0, 10).map((record) => (
                        <TableRow key={record.id}>
                          <TableCell>{record.date}</TableCell>
                          <TableCell className={record.isLate ? "text-amber-600" : ""}>{record.checkIn || "-"}</TableCell>
                          <TableCell className={record.isEarlyOut ? "text-amber-600" : ""}>{record.checkOut || "-"}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{record.status?.toUpperCase()}</Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
            
            <TabsContent value="payroll" className="pt-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Basic Salary</p>
                    <p className="text-xl font-bold">PKR {employee.basicSalary?.toLocaleString() || "0"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Allowances</p>
                    <p className="text-xl font-bold">PKR {employee.allowances?.toLocaleString() || "0"}</p>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
