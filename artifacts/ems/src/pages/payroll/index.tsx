import { useState } from "react";
import { useListPayroll, useGetPayrollSummary } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Download } from "lucide-react";
import { format } from "date-fns";

export default function PayrollList() {
  const currentDate = new Date();
  const [month, setMonth] = useState(currentDate.getMonth() + 1);
  const [year, setYear] = useState(currentDate.getFullYear());

  const { data: summary } = useGetPayrollSummary({ month, year });
  const { data: payrollList, isLoading } = useListPayroll({ month, year });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Payroll</h1>
          <p className="text-sm text-gray-500">Manage employee salaries, deductions, and payslips.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            Export Bank File
          </Button>
          <Button className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Generate Payroll
          </Button>
        </div>
      </div>

      <div className="flex gap-4">
        <Select value={month.toString()} onValueChange={(v) => setMonth(Number(v))}>
          <SelectTrigger className="w-[180px] bg-white"><SelectValue placeholder="Month" /></SelectTrigger>
          <SelectContent>
            {Array.from({length: 12}).map((_, i) => (
              <SelectItem key={i+1} value={(i+1).toString()}>
                {format(new Date(2000, i, 1), 'MMMM')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={year.toString()} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-[120px] bg-white"><SelectValue placeholder="Year" /></SelectTrigger>
          <SelectContent>
            {[2024, 2025, 2026].map(y => (
              <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="text-sm font-medium text-gray-500">Total Payroll</div>
            <div className="text-2xl font-bold mt-1">PKR {summary.totalNet?.toLocaleString()}</div>
          </div>
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="text-sm font-medium text-gray-500">Gross Amount</div>
            <div className="text-2xl font-bold mt-1">PKR {summary.totalGross?.toLocaleString()}</div>
          </div>
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="text-sm font-medium text-gray-500">Deductions</div>
            <div className="text-2xl font-bold mt-1 text-red-600">PKR {summary.totalDeductions?.toLocaleString()}</div>
          </div>
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="text-sm font-medium text-gray-500">Employees Processed</div>
            <div className="text-2xl font-bold mt-1">{summary.totalEmployees}</div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-gray-50 dark:bg-gray-900/50">
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead className="text-right">Basic</TableHead>
                <TableHead className="text-right">Allowances</TableHead>
                <TableHead className="text-right">Deductions</TableHead>
                <TableHead className="text-right font-bold">Net Salary</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Payslip</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-16 mx-auto rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : payrollList?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-gray-500">
                    No payroll records found for this period.
                  </TableCell>
                </TableRow>
              ) : (
                payrollList?.map((record) => {
                  const totalDed = (record.lateDeductions || 0) + (record.leaveDeductions || 0) + (record.otherDeductions || 0);
                  return (
                    <TableRow key={record.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50">
                      <TableCell>
                        <div className="font-medium">{record.employeeName}</div>
                        <div className="text-xs text-gray-500">{record.employeeCode}</div>
                      </TableCell>
                      <TableCell className="text-right text-gray-600">PKR {record.basicSalary?.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-gray-600">PKR {record.allowances?.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-red-600">-PKR {totalDed.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-bold">PKR {record.netSalary?.toLocaleString()}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={record.status === "paid" ? "bg-green-100 text-green-800" : ""}>
                          {record.status?.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm">View</Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
