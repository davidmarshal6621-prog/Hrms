import { useState, useEffect } from "react";
import { useGetCompanySettings } from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Save, Building2, Globe, DollarSign, Eye } from "lucide-react";

async function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("ems_token");
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...opts?.headers },
  });
  if (!res.ok) { const t = await res.text(); throw new Error(t); }
  return res.json();
}

const CURRENCIES = [
  { code: "PKR", symbol: "Rs." },
  { code: "USD", symbol: "$" },
  { code: "EUR", symbol: "€" },
  { code: "GBP", symbol: "£" },
  { code: "AED", symbol: "د.إ" },
  { code: "SAR", symbol: "﷼" },
  { code: "INR", symbol: "₹" },
];

const TIMEZONES = [
  "Asia/Karachi", "Asia/Kolkata", "Asia/Dubai", "Asia/Riyadh",
  "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles",
  "UTC",
];

function Section({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-5">
      <div className="flex items-center gap-2 border-b pb-3">
        <Icon className="h-4 w-4 text-indigo-600" />
        <h2 className="font-semibold text-gray-900">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-gray-700">{label}</Label>
      {children}
    </div>
  );
}

export default function CompanySettings() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: settings, isLoading } = useGetCompanySettings();

  const [form, setForm] = useState({
    companyName: "",
    companyLogo: "",
    currency: "PKR",
    currencySymbol: "Rs.",
    dateFormat: "DD/MM/YYYY",
    salaryVisibility: "admin_hr",
    showSalaryToEmployee: "false",
    timezone: "Asia/Karachi",
  });

  useEffect(() => {
    if (settings) {
      setForm({
        companyName: settings.companyName || "My Company",
        companyLogo: settings.companyLogo || "",
        currency: settings.currency || "PKR",
        currencySymbol: settings.currencySymbol || "Rs.",
        dateFormat: settings.dateFormat || "DD/MM/YYYY",
        salaryVisibility: settings.salaryVisibility || "admin_hr",
        showSalaryToEmployee: settings.showSalaryToEmployee || "false",
        timezone: settings.timezone || "Asia/Karachi",
      });
    }
  }, [settings]);

  const saveMut = useMutation({
    mutationFn: (data: typeof form) => apiFetch("/company-settings", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["getCompanySettings"] });
      toast({ title: "Settings saved", description: "Company settings updated successfully." });
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  function setCurrency(code: string) {
    const curr = CURRENCIES.find(c => c.code === code);
    setForm(f => ({ ...f, currency: code, currencySymbol: curr?.symbol ?? f.currencySymbol }));
  }

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-white rounded-lg border border-gray-200 p-6 h-40 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Company Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Configure your company profile, locale, and visibility preferences.</p>
      </div>

      {/* Company Identity */}
      <Section icon={Building2} title="Company Identity">
        <Field label="Company Name">
          <Input
            value={form.companyName}
            onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))}
            placeholder="e.g. Acme Corp"
          />
        </Field>
        <Field label="Company Logo URL">
          <div className="flex gap-3 items-center">
            <Input
              value={form.companyLogo}
              onChange={e => setForm(f => ({ ...f, companyLogo: e.target.value }))}
              placeholder="https://example.com/logo.png"
              className="flex-1"
            />
            {form.companyLogo && (
              <img src={form.companyLogo} alt="Logo preview" className="h-10 w-10 rounded object-contain border border-gray-200 p-0.5" />
            )}
          </div>
        </Field>
      </Section>

      {/* Locale */}
      <Section icon={Globe} title="Locale & Format">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Currency">
            <Select value={form.currency} onValueChange={setCurrency}>
              <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map(c => (
                  <SelectItem key={c.code} value={c.code}>{c.code} ({c.symbol})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Currency Symbol">
            <Input
              value={form.currencySymbol}
              onChange={e => setForm(f => ({ ...f, currencySymbol: e.target.value }))}
              placeholder="e.g. Rs."
            />
          </Field>
        </div>
        <Field label="Date Format">
          <Select value={form.dateFormat} onValueChange={v => setForm(f => ({ ...f, dateFormat: v }))}>
            <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="DD/MM/YYYY">DD/MM/YYYY (31/12/2025)</SelectItem>
              <SelectItem value="MM/DD/YYYY">MM/DD/YYYY (12/31/2025)</SelectItem>
              <SelectItem value="YYYY-MM-DD">YYYY-MM-DD (2025-12-31)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Timezone">
          <Select value={form.timezone} onValueChange={v => setForm(f => ({ ...f, timezone: v }))}>
            <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIMEZONES.map(tz => (
                <SelectItem key={tz} value={tz}>{tz}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </Section>

      {/* Salary Visibility */}
      <Section icon={Eye} title="Salary Visibility">
        <Field label="Who can see employee salaries?">
          <Select value={form.salaryVisibility} onValueChange={v => setForm(f => ({ ...f, salaryVisibility: v }))}>
            <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="admin_only">Admin Only</SelectItem>
              <SelectItem value="admin_hr">Admins & HR</SelectItem>
              <SelectItem value="all_managers">Admins, HR & Managers</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
          <div>
            <div className="text-sm font-medium text-gray-700">Show salary to employee on payslip</div>
            <div className="text-xs text-gray-500">Employees can see their own net salary on downloaded payslips</div>
          </div>
          <Switch
            checked={form.showSalaryToEmployee === "true"}
            onCheckedChange={v => setForm(f => ({ ...f, showSalaryToEmployee: v ? "true" : "false" }))}
          />
        </div>
      </Section>

      {/* Save */}
      <div className="flex justify-end">
        <Button
          onClick={() => saveMut.mutate(form)}
          disabled={saveMut.isPending}
          className="flex items-center gap-2 min-w-[120px]"
        >
          <Save className="h-4 w-4" />
          {saveMut.isPending ? "Saving..." : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}
