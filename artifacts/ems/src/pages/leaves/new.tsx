import { useState } from "react";
import { useLocation } from "wouter";
import { useCreateLeave, useListLeaveTypes } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function NewLeave() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createLeave = useCreateLeave();
  const { data: leaveTypes } = useListLeaveTypes();

  const [formData, setFormData] = useState({
    leaveTypeId: "",
    startDate: "",
    endDate: "",
    reason: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.leaveTypeId) {
      toast({ title: "Please select a leave type", variant: "destructive" });
      return;
    }
    createLeave.mutate(
      { 
        data: { 
          leaveTypeId: Number(formData.leaveTypeId),
          startDate: formData.startDate,
          endDate: formData.endDate,
          reason: formData.reason
        } 
      },
      {
        onSuccess: () => {
          toast({ title: "Leave request submitted" });
          setLocation("/leaves");
        },
        onError: (err: any) => {
          toast({ title: "Submission failed", description: err.message, variant: "destructive" });
        }
      }
    );
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/leaves">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Apply for Leave</h1>
          <p className="text-sm text-gray-500">Submit a new leave request for approval.</p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label>Leave Type *</Label>
            <Select value={formData.leaveTypeId} onValueChange={(val) => setFormData({...formData, leaveTypeId: val})}>
              <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                {leaveTypes?.map(t => <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Start Date *</Label>
              <Input type="date" required value={formData.startDate} onChange={(e) => setFormData({...formData, startDate: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>End Date *</Label>
              <Input type="date" required value={formData.endDate} onChange={(e) => setFormData({...formData, endDate: e.target.value})} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Reason</Label>
            <Textarea 
              rows={4} 
              value={formData.reason} 
              onChange={(e) => setFormData({...formData, reason: e.target.value})} 
              placeholder="Please provide details for your leave request..." 
            />
          </div>

          <div className="flex justify-end gap-4 pt-4">
            <Link href="/leaves">
              <Button variant="outline" type="button">Cancel</Button>
            </Link>
            <Button type="submit" disabled={createLeave.isPending}>
              {createLeave.isPending ? "Submitting..." : "Submit Request"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
