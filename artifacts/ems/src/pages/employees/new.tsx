import { useState } from "react";
import { useLocation } from "wouter";
import { useCreateEmployee, useListDepartments, useListBranches, useListShifts } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function NewEmployee() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createEmployee = useCreateEmployee();

  const { data: departments } = useListDepartments();
  const { data: branches } = useListBranches();
  const { data: shifts } = useListShifts();

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    employeeCode: "",
    email: "",
    phone: "",
    designation: "",
    departmentId: "",
    branchId: "",
    shiftId: "",
    basicSalary: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createEmployee.mutate(
      { 
        data: { 
          ...formData, 
          departmentId: formData.departmentId ? Number(formData.departmentId) : undefined,
          branchId: formData.branchId ? Number(formData.branchId) : undefined,
          shiftId: formData.shiftId ? Number(formData.shiftId) : undefined,
          basicSalary: formData.basicSalary ? Number(formData.basicSalary) : undefined,
        } 
      },
      {
        onSuccess: () => {
          toast({ title: "Employee created successfully" });
          setLocation("/employees");
        },
        onError: (err: any) => {
          toast({ title: "Failed to create employee", description: err.message, variant: "destructive" });
        }
      }
    );
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/employees">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Add New Employee</h1>
          <p className="text-sm text-gray-500">Enter employee details to register them in the system.</p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Employee Code *</Label>
              <Input required value={formData.employeeCode} onChange={(e) => setFormData({...formData, employeeCode: e.target.value})} placeholder="EMP-001" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} placeholder="employee@company.com" />
            </div>
            
            <div className="space-y-2">
              <Label>First Name *</Label>
              <Input required value={formData.firstName} onChange={(e) => setFormData({...formData, firstName: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Last Name *</Label>
              <Input required value={formData.lastName} onChange={(e) => setFormData({...formData, lastName: e.target.value})} />
            </div>

            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Designation</Label>
              <Input value={formData.designation} onChange={(e) => setFormData({...formData, designation: e.target.value})} placeholder="e.g. Software Engineer" />
            </div>

            <div className="space-y-2">
              <Label>Department</Label>
              <Select value={formData.departmentId} onValueChange={(val) => setFormData({...formData, departmentId: val})}>
                <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent>
                  {departments?.map(d => <SelectItem key={d.id} value={d.id.toString()}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Branch</Label>
              <Select value={formData.branchId} onValueChange={(val) => setFormData({...formData, branchId: val})}>
                <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                <SelectContent>
                  {branches?.map(b => <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Shift</Label>
              <Select value={formData.shiftId} onValueChange={(val) => setFormData({...formData, shiftId: val})}>
                <SelectTrigger><SelectValue placeholder="Select shift" /></SelectTrigger>
                <SelectContent>
                  {shifts?.map(s => <SelectItem key={s.id} value={s.id.toString()}>{s.name} ({s.startTime} - {s.endTime})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Basic Salary</Label>
              <Input type="number" value={formData.basicSalary} onChange={(e) => setFormData({...formData, basicSalary: e.target.value})} placeholder="0.00" />
            </div>
          </div>

          <div className="flex justify-end gap-4 pt-4 border-t border-gray-100 dark:border-gray-700">
            <Link href="/employees">
              <Button variant="outline" type="button">Cancel</Button>
            </Link>
            <Button type="submit" disabled={createEmployee.isPending}>
              {createEmployee.isPending ? "Saving..." : "Save Employee"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
