import { useState } from "react";
import { useListAttendance } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Calendar as CalendarIcon, FileText } from "lucide-react";
import { format } from "date-fns";

export default function AttendanceList() {
  const [date, setDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const { data: attendanceData, isLoading } = useListAttendance({ date });

  const getStatusColor = (status?: string) => {
    switch(status) {
      case 'present': return 'bg-green-100 text-green-800';
      case 'absent': return 'bg-red-100 text-red-800';
      case 'late': return 'bg-amber-100 text-amber-800';
      case 'half-day': return 'bg-orange-100 text-orange-800';
      case 'on-leave': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Attendance</h1>
          <p className="text-sm text-gray-500">Track and manage daily employee attendance records.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Export Report
          </Button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row gap-4 justify-between bg-gray-50/50 dark:bg-gray-800/50">
          <div className="flex gap-4 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input 
                placeholder="Search employee..." 
                className="pl-9 bg-white dark:bg-gray-900"
              />
            </div>
            <div className="relative">
              <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input 
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="pl-9 bg-white dark:bg-gray-900 w-full sm:w-44"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-gray-50 dark:bg-gray-900/50">
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Check In</TableHead>
                <TableHead>Check Out</TableHead>
                <TableHead>Working Hours</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                    </TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : attendanceData?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-gray-500">
                    No attendance records found for this date.
                  </TableCell>
                </TableRow>
              ) : (
                attendanceData?.map((record) => (
                  <TableRow key={record.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50">
                    <TableCell>
                      <div className="font-medium text-gray-900 dark:text-gray-100">{record.employeeName}</div>
                      <div className="text-xs text-gray-500">{record.employeeCode}</div>
                    </TableCell>
                    <TableCell className="text-gray-600">{record.date}</TableCell>
                    <TableCell className={record.isLate ? "text-amber-600 font-medium" : ""}>
                      {record.checkIn || "--:--"}
                    </TableCell>
                    <TableCell className={record.isEarlyOut ? "text-amber-600 font-medium" : ""}>
                      {record.checkOut || "--:--"}
                    </TableCell>
                    <TableCell>{record.workingHours ? `${record.workingHours.toFixed(1)} hrs` : "-"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`border-0 ${getStatusColor(record.status)}`}>
                        {record.status?.replace('-', ' ').toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm">Edit</Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
