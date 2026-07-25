import { useState, useMemo } from "react";
import { useListPunchLogs, useListEmployees } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Download, Fingerprint, CreditCard, KeyRound, ScanFace } from "lucide-react";
import { format } from "date-fns";

const PAGE_SIZE = 50;

const DIRECTION_STYLES: Record<string, string> = {
  in: "bg-green-100 text-green-800",
  out: "bg-blue-100 text-blue-800",
  "break-out": "bg-orange-100 text-orange-800",
  "break-in": "bg-yellow-100 text-yellow-800",
};

function VerifyBadge({ type }: { type?: string | null }) {
  switch (type) {
    case "fingerprint": return (
      <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 gap-1">
        <Fingerprint className="h-3 w-3" /> Finger
      </Badge>
    );
    case "face": return (
      <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 gap-1">
        <ScanFace className="h-3 w-3" /> Face
      </Badge>
    );
    case "card": return (
      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 gap-1">
        <CreditCard className="h-3 w-3" /> Card
      </Badge>
    );
    case "password": return (
      <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-200 gap-1">
        <KeyRound className="h-3 w-3" /> Password
      </Badge>
    );
    default: return <Badge variant="outline" className="text-gray-500">{type || "unknown"}</Badge>;
  }
}

function exportCsv(rows: any[]) {
  const headers = ["Time", "Employee", "Code", "Device", "Direction", "Verify Type", "Raw Punch", "Raw Verify"];
  const lines = [
    headers.join(","),
    ...rows.map(r => [
      `"${r.punchTime}"`,
      `"${r.employeeName || ""}"`,
      `"${r.employeeCode || ""}"`,
      `"${r.deviceName || ""}"`,
      `"${r.punchDirection}"`,
      `"${r.verifyType}"`,
      r.rawPunch ?? "",
      r.rawVerify ?? "",
    ].join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `punch_logs_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function PunchLogsPage() {
  const today = format(new Date(), "yyyy-MM-dd");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [search, setSearch] = useState("");
  const [verifyFilter, setVerifyFilter] = useState("all");
  const [dirFilter, setDirFilter] = useState("all");
  const [page, setPage] = useState(0);

  const { data: logs = [], isLoading } = useListPunchLogs({
    startDate, endDate, limit: 2000,
  });

  const { data: employees = [] } = useListEmployees({});

  const filtered = useMemo(() => {
    let r = [...logs];
    if (search) {
      const s = search.toLowerCase();
      r = r.filter(l =>
        l.employeeName?.toLowerCase().includes(s) ||
        l.employeeCode?.toLowerCase().includes(s) ||
        l.enrollNumber?.toLowerCase().includes(s) ||
        l.deviceName?.toLowerCase().includes(s)
      );
    }
    if (verifyFilter !== "all") r = r.filter(l => l.verifyType === verifyFilter);
    if (dirFilter !== "all") r = r.filter(l => l.punchDirection === dirFilter);
    return r;
  }, [logs, search, verifyFilter, dirFilter]);

  const pageData = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Raw Punch Logs</h1>
          <p className="text-sm text-gray-500">Every raw event captured from ZKTeco biometric devices.</p>
        </div>
        <Button variant="outline" onClick={() => exportCsv(filtered)} className="flex items-center gap-2">
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-wrap gap-3 items-end">
        <div>
          <div className="text-xs font-medium text-gray-500 mb-1">From</div>
          <Input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setPage(0); }}
            className="w-36 bg-white" />
        </div>
        <div>
          <div className="text-xs font-medium text-gray-500 mb-1">To</div>
          <Input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setPage(0); }}
            className="w-36 bg-white" />
        </div>
        <div className="relative flex-1 min-w-[180px]">
          <div className="text-xs font-medium text-gray-500 mb-1">Search</div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input placeholder="Name, code, device..." value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }}
              className="pl-9 bg-white" />
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-gray-500 mb-1">Verify Type</div>
          <Select value={verifyFilter} onValueChange={v => { setVerifyFilter(v); setPage(0); }}>
            <SelectTrigger className="w-36 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="fingerprint">Fingerprint</SelectItem>
              <SelectItem value="face">Face</SelectItem>
              <SelectItem value="card">Card</SelectItem>
              <SelectItem value="password">Password</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="text-xs font-medium text-gray-500 mb-1">Direction</div>
          <Select value={dirFilter} onValueChange={v => { setDirFilter(v); setPage(0); }}>
            <SelectTrigger className="w-32 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="in">In</SelectItem>
              <SelectItem value="out">Out</SelectItem>
              <SelectItem value="break-out">Break Out</SelectItem>
              <SelectItem value="break-in">Break In</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex gap-3 flex-wrap text-xs">
        <span className="bg-gray-100 text-gray-700 px-3 py-1.5 rounded-full font-medium">
          Total: {filtered.length} punches
        </span>
        <span className="bg-purple-100 text-purple-700 px-3 py-1.5 rounded-full">
          Fingerprint: {filtered.filter(l => l.verifyType === "fingerprint").length}
        </span>
        <span className="bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-full">
          Face: {filtered.filter(l => l.verifyType === "face").length}
        </span>
        <span className="bg-blue-100 text-blue-700 px-3 py-1.5 rounded-full">
          Card: {filtered.filter(l => l.verifyType === "card").length}
        </span>
        <span className="bg-green-100 text-green-700 px-3 py-1.5 rounded-full">
          IN: {filtered.filter(l => l.punchDirection === "in").length}
        </span>
        <span className="bg-blue-100 text-blue-700 px-3 py-1.5 rounded-full">
          OUT: {filtered.filter(l => l.punchDirection === "out").length}
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-gray-50">
              <TableRow>
                <TableHead>Date & Time</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Device</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead>Verify Type</TableHead>
                <TableHead className="text-center">Raw Codes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : pageData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-gray-400">
                    No punch logs found for this date range.
                  </TableCell>
                </TableRow>
              ) : (
                pageData.map((log) => (
                  <TableRow key={log.id} className="hover:bg-gray-50/50">
                    <TableCell className="font-mono text-xs text-gray-600 whitespace-nowrap">
                      <div className="font-medium text-gray-800">{log.punchTime.slice(0, 10)}</div>
                      <div>{log.punchTime.slice(11, 19)}</div>
                    </TableCell>
                    <TableCell>
                      {log.employeeName ? (
                        <>
                          <div className="font-medium text-gray-900">{log.employeeName}</div>
                          <div className="text-xs text-gray-500">{log.employeeCode} • #{log.enrollNumber}</div>
                        </>
                      ) : (
                        <div className="text-gray-400 italic">Enroll #{log.enrollNumber}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">{log.deviceName || "-"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`border-0 capitalize ${DIRECTION_STYLES[log.punchDirection] ?? "bg-gray-100 text-gray-600"}`}>
                        {log.punchDirection.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell><VerifyBadge type={log.verifyType} /></TableCell>
                    <TableCell className="text-center font-mono text-xs text-gray-400">
                      P:{log.rawPunch ?? "-"} V:{log.rawVerify ?? "-"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <div className="text-sm text-gray-500">
              Page {page + 1} of {totalPages} ({filtered.length} records)
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                Previous
              </Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
