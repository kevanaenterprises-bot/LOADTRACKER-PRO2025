import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function EmergencyLoadTest() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState("");
  const { toast } = useToast();

  const emergencyTest = async () => {
    setIsLoading(true);
    setResult("=== EMERGENCY LOAD CREATION TEST ===\n");
    
    try {
      // Step 1: Admin login
      setResult(prev => prev + "Step 1: Admin login...\n");
      const loginResponse = await fetch("/api/auth/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "go4fc2024" }),
        credentials: "include",
      });
      
      if (loginResponse.ok) {
        setResult(prev => prev + "✓ Admin login successful\n");
      } else {
        const loginError = await loginResponse.text();
        setResult(prev => prev + `✗ Admin login failed: ${loginError}\n`);
        return;
      }
      
      // Step 2: Get bypass token
      setResult(prev => prev + "Step 2: Getting bypass token...\n");
      const bypassResponse = await fetch("/api/auth/browser-bypass", {
        method: "POST",
        credentials: "include",
      });
      
      let token = "";
      if (bypassResponse.ok) {
        const data = await bypassResponse.json();
        token = data.token;
        setResult(prev => prev + `✓ Got bypass token: ${token.substring(0, 15)}...\n`);
      } else {
        setResult(prev => prev + "✗ Failed to get bypass token\n");
        return;
      }
      
      // Step 3: Get locations first
      setResult(prev => prev + "Step 3: Getting locations...\n");
      const locationsResponse = await fetch("/api/locations", {
        credentials: "include",
        headers: { "X-Bypass-Token": token }
      });
      
      let locationId = "";
      if (locationsResponse.ok) {
        const locations = await locationsResponse.json();
        locationId = locations[0]?.id || "";
        setResult(prev => prev + `✓ Got ${locations.length} locations, using: ${locationId}\n`);
      } else {
        setResult(prev => prev + "✗ Failed to get locations\n");
        return;
      }
      
      // Step 4: Create load with all debugging
      setResult(prev => prev + "Step 4: Creating load...\n");
      const loadData = {
        number109: `EMERGENCY-${Date.now()}`,
        locationId: locationId,
        estimatedMiles: 100,
        specialInstructions: "Emergency load creation test",
        status: "created"
      };
      
      setResult(prev => prev + `Sending data: ${JSON.stringify(loadData, null, 2)}\n`);
      
      const loadResponse = await fetch("/api/loads", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-Bypass-Token": token
        },
        body: JSON.stringify(loadData),
        credentials: "include",
      });
      
      setResult(prev => prev + `Load response status: ${loadResponse.status}\n`);
      
      if (loadResponse.ok) {
        const loadResult = await loadResponse.json();
        setResult(prev => prev + `🎉 SUCCESS! Load created: ${loadResult.number109}\n`);
        setResult(prev => prev + `Load ID: ${loadResult.id}\n`);
        toast({
          title: "SUCCESS!",
          description: "Emergency load creation test passed!"
        });
      } else {
        const errorText = await loadResponse.text();
        setResult(prev => prev + `✗ Load creation failed:\n`);
        setResult(prev => prev + `Status: ${loadResponse.status}\n`);
        setResult(prev => prev + `Error: ${errorText}\n`);
        
        // Additional debugging
        setResult(prev => prev + `Request headers sent:\n`);
        setResult(prev => prev + `- Content-Type: application/json\n`);
        setResult(prev => prev + `- X-Bypass-Token: ${token}\n`);
        setResult(prev => prev + `- credentials: include\n`);
      }
      
    } catch (error: any) {
      setResult(prev => prev + `💥 FATAL ERROR: ${error.message}\n`);
      setResult(prev => prev + `Stack: ${error.stack}\n`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>🚨 Emergency Load Creation Test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h3 className="font-semibold text-red-800 mb-2">Production Emergency Fix</h3>
            <p className="text-sm text-red-700">
              This is a comprehensive test to identify the exact cause of the "not a valid token" error.
              It will test every step: login → token → locations → load creation.
            </p>
          </div>
          
          <Button 
            onClick={emergencyTest} 
            disabled={isLoading}
            className="w-full bg-red-600 hover:bg-red-700"
            size="lg"
          >
            {isLoading ? "🔍 Testing..." : "🚨 Run Emergency Test"}
          </Button>
          
          <div>
            <Label htmlFor="test-result">Detailed Test Results</Label>
            <textarea
              id="test-result"
              value={result}
              readOnly
              rows={20}
              className="w-full p-3 border rounded-md font-mono text-sm bg-gray-50"
              placeholder="Click 'Run Emergency Test' to see detailed results..."
            />
          </div>
          
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-800 mb-2">Instructions:</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-blue-700">
              <li>Access this page on production: /emergency-load-test</li>
              <li>Click "Run Emergency Test"</li>
              <li>Copy ALL the output and share it</li>
              <li>This will show exactly where the error occurs</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}