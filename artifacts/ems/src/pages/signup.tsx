import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api-path";

type SignupResponse = {
  user: {
    id: number;
    email: string;
    name: string;
    role: string;
    employeeId: number | null;
    tenantId: number;
    tenantName: string;
  };
  token: string;
};

export default function Signup() {
  const [companyName, setCompanyName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      const response = await fetch(apiUrl("/auth/signup"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName, name, email, password }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not create your workspace");
      const data = body as SignupResponse;
      login(data.user, data.token);
      setLocation("/dashboard");
    } catch (error) {
      toast({
        title: "Signup failed",
        description: error instanceof Error ? error.message : "Could not create your workspace",
        variant: "destructive",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-10">
      <div className="max-w-md w-full p-8 bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Create your company workspace</h1>
          <p className="text-sm text-gray-500 mt-2">Your data and biometric devices stay separate from other companies.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="companyName">Company name</Label>
            <Input id="companyName" value={companyName} onChange={event => setCompanyName(event.target.value)} minLength={2} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Your name</Label>
            <Input id="name" value={name} onChange={event => setName(event.target.value)} minLength={2} autoComplete="name" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Work email</Label>
            <Input id="email" type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              minLength={8}
              autoComplete="new-password"
              required
            />
            <p className="text-xs text-gray-500">Use at least 8 characters.</p>
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Creating workspace..." : "Create company workspace"}
          </Button>
        </form>
        <p className="text-sm text-center text-gray-500 mt-6">
          Already have an account? <Link href="/login" className="font-medium text-blue-600 hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}