import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

export default function ProductionDebug() {
  const [debugOutput, setDebugOutput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const runAuthTest = async () => {
    setIsLoading(true);
    setDebugOutput("Testing authentication methods...\n\n");
    
    try {
      // Test 1: Check current auth status
      setDebugOutput(prev => prev + "Test 1: Checking current authentication status...\n");
      
      const authChecks = [
        { name: "Admin Auth", url: "/api/auth/admin-user" },
        { name: "Replit Auth", url: "/api/auth/user" },
        { name: "Driver Auth", url: "/api/auth/driver-user" }
      ];
      
      for (const check of authChecks) {
        try {
          const response = await fetch(check.url);
          const data = await response.json();
          setDebugOutput(prev => prev + `${check.name}: ${response.status} - ${JSON.stringify(data)}\n`);
        } catch (error) {
          setDebugOutput(prev => prev + `${check.name}: ERROR - ${error}\n`);
        }
      }
      
      // Test 2: Try admin login
      setDebugOutput(prev => prev + "\nTest 2: Attempting admin login...\n");
      try {
        const loginResponse = await fetch("/api/auth/admin-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "admin", password: "go4fc2024" })
        });
        const loginData = await loginResponse.json();
        setDebugOutput(prev => prev + `Admin Login: ${loginResponse.status} - ${JSON.stringify(loginData)}\n`);
        
        // If login successful, try creating a load
        if (loginResponse.ok) {
          setDebugOutput(prev => prev + "\nTest 3: Attempting load creation after admin login...\n");
          const loadResponse = await fetch("/api/loads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              number109: `DEBUG-${Date.now()}`,
              locationId: "d934f547-7ca5-447d-b30b-759629ce9e81",
              estimatedMiles: 100,
              specialInstructions: "Debug test load",
              status: "created"
            })
          });
          const loadData = await loadResponse.json();
          setDebugOutput(prev => prev + `Load Creation: ${loadResponse.status} - ${JSON.stringify(loadData)}\n`);
        }
      } catch (error) {
        setDebugOutput(prev => prev + `Admin Login ERROR: ${error}\n`);
      }
      
      // Test 3: Try with bypass token
      setDebugOutput(prev => prev + "\nTest 4: Attempting load creation with bypass token...\n");
      try {
        const bypassResponse = await fetch("/api/loads", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "X-Bypass-Token": "LOADTRACKER_BYPASS_2025"
          },
          body: JSON.stringify({
            number109: `BYPASS-${Date.now()}`,
            locationId: "d934f547-7ca5-447d-b30b-759629ce9e81",
            estimatedMiles: 100,
            specialInstructions: "Bypass test load",
            status: "created"
          })
        });
        const bypassData = await bypassResponse.json();
        setDebugOutput(prev => prev + `Bypass Load Creation: ${bypassResponse.status} - ${JSON.stringify(bypassData)}\n`);
      } catch (error) {
        setDebugOutput(prev => prev + `Bypass Load Creation ERROR: ${error}\n`);
      }
      
      setDebugOutput(prev => prev + "\nDebugging complete!");
      
    } catch (error) {
      setDebugOutput(prev => prev + `\nFATAL ERROR: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const testSimpleLoad = async () => {
    setIsLoading(true);
    try {
      // First login as admin
      const loginResponse = await fetch("/api/auth/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "go4fc2024" })
      });
      
      if (!loginResponse.ok) {
        throw new Error("Login failed");
      }
      
      // Then create load
      const loadResponse = await fetch("/api/loads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          number109: `SIMPLE-${Date.now()}`,
          locationId: "d934f547-7ca5-447d-b30b-759629ce9e81",
          estimatedMiles: 100,
          specialInstructions: "Simple test load",
          status: "created"
        })
      });
      
      if (loadResponse.ok) {
        toast({
          title: "Success!",
          description: "Load created successfully!"
        });
      } else {
        const errorData = await loadResponse.json();
        toast({
          title: "Error",
          description: `Failed: ${errorData.message}`,
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: `Test failed: ${error}`,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Production Authentication Debug Tool</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <Button 
              onClick={runAuthTest} 
              disabled={isLoading}
              className="flex-1"
            >
              {isLoading ? "Running Tests..." : "Run Full Auth Test"}
            </Button>
            <Button 
              onClick={testSimpleLoad} 
              disabled={isLoading}
              variant="outline"
              className="flex-1"
            >
              {isLoading ? "Testing..." : "Quick Load Test"}
            </Button>
          </div>
          
          <div>
            <Label htmlFor="debug-output">Debug Output</Label>
            <Textarea
              id="debug-output"
              value={debugOutput}
              readOnly
              rows={20}
              className="font-mono text-sm"
              placeholder="Click 'Run Full Auth Test' to see detailed debugging information..."
            />
          </div>
          
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-800 mb-2">Instructions for Production Site:</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-blue-700">
              <li>Navigate to your production site URL + /production-debug</li>
              <li>Click "Run Full Auth Test" to see detailed error information</li>
              <li>Copy the debug output and share it for analysis</li>
              <li>Try "Quick Load Test" to see if simple load creation works</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}