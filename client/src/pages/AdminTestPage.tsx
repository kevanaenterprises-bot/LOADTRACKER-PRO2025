import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function AdminTestPage() {
  const [loginData, setLoginData] = useState({ username: "admin", password: "go4fc2024" });
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const { toast } = useToast();

  const testLogin = async () => {
    try {
      const response = await fetch("/api/auth/admin-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // Important for cookies
        body: JSON.stringify(loginData),
      });

      const result = await response.json();
      if (response.ok) {
        toast({ title: "Login successful", description: "Admin authenticated" });
        checkSession();
      } else {
        toast({ title: "Login failed", description: result.message, variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Login request failed", variant: "destructive" });
    }
  };

  const checkSession = async () => {
    try {
      const response = await fetch("/api/auth/admin-user", {
        credentials: "include",
      });
      
      if (response.ok) {
        const user = await response.json();
        setSessionInfo({ status: "authenticated", user });
      } else {
        setSessionInfo({ status: "not authenticated", error: await response.text() });
      }
    } catch (error) {
      setSessionInfo({ status: "error", error: String(error) });
    }
  };

  const activateBrowserBypass = async () => {
    try {
      const response = await fetch("/api/auth/browser-bypass", {
        method: "POST",
        credentials: "include",
      });
      
      const result = await response.json();
      if (response.ok) {
        toast({ title: "Browser bypass activated", description: "You can now assign drivers" });
      } else {
        toast({ title: "Bypass failed", description: result.message, variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Bypass request failed", variant: "destructive" });
    }
  };

  const testDriverAssignment = async () => {
    try {
      const response = await fetch("/api/loads/5fac985a-8dc7-49ee-b207-164e32a08da3/assign-driver", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ driverId: "3d695e14-15c8-47df-9d09-2d458738b4c4" }),
      });

      const result = await response.json();
      if (response.ok) {
        toast({ title: "Driver assigned", description: "Assignment successful" });
      } else {
        toast({ title: "Assignment failed", description: result.message, variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Assignment request failed", variant: "destructive" });
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Authentication Test Page</CardTitle>
          <CardDescription>Test admin login and session persistence</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={loginData.username}
                onChange={(e) => setLoginData({ ...loginData, username: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={loginData.password}
                onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
              />
            </div>
          </div>
          
          <div className="flex gap-2 flex-wrap">
            <Button onClick={testLogin}>Login</Button>
            <Button onClick={checkSession} variant="outline">Check Session</Button>
            <Button onClick={activateBrowserBypass} variant="default" className="bg-orange-600 hover:bg-orange-700">
              Browser Bypass
            </Button>
            <Button onClick={testDriverAssignment} variant="secondary">Test Assignment</Button>
          </div>

          {sessionInfo && (
            <Card>
              <CardHeader>
                <CardTitle>Session Status</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-sm bg-gray-100 p-2 rounded">
                  {JSON.stringify(sessionInfo, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  );
}