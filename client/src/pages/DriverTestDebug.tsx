import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function DriverTestDebug() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState("");
  const { toast } = useToast();

  const testDriverCreation = async () => {
    setIsLoading(true);
    setResult("=== DRIVER CREATION DEBUG TEST ===\n");
    
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
      
      // Step 3: Test driver creation
      setResult(prev => prev + "Step 3: Creating test driver...\n");
      const driverData = {
        firstName: "Test",
        lastName: "Driver",
        phoneNumber: "1234567890",
        username: `test_driver_${Date.now()}`,
        role: "driver"
      };
      
      setResult(prev => prev + `Sending data: ${JSON.stringify(driverData, null, 2)}\n`);
      
      const driverResponse = await fetch("/api/drivers", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-Bypass-Token": token
        },
        body: JSON.stringify(driverData),
        credentials: "include",
      });
      
      setResult(prev => prev + `Driver response status: ${driverResponse.status}\n`);
      const headersList = Array.from(driverResponse.headers.entries());
      setResult(prev => prev + `Driver response headers: ${JSON.stringify(headersList)}\n`);
      
      if (driverResponse.ok) {
        const driverResult = await driverResponse.json();
        setResult(prev => prev + `🎉 SUCCESS! Driver created: ${driverResult.username}\n`);
        setResult(prev => prev + `Driver ID: ${driverResult.id}\n`);
        toast({
          title: "SUCCESS!",
          description: "Driver creation test passed!"
        });
      } else {
        const errorText = await driverResponse.text();
        setResult(prev => prev + `✗ Driver creation failed:\n`);
        setResult(prev => prev + `Status: ${driverResponse.status}\n`);
        setResult(prev => prev + `Error: ${errorText}\n`);
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
          <CardTitle>🔧 Driver Creation Debug Test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-800 mb-2">Debug Test</h3>
            <p className="text-sm text-blue-700">
              This will test the exact driver creation process with detailed logging.
            </p>
          </div>
          
          <Button 
            onClick={testDriverCreation} 
            disabled={isLoading}
            className="w-full"
            size="lg"
          >
            {isLoading ? "🔍 Testing..." : "🔧 Test Driver Creation"}
          </Button>
          
          <div>
            <Label htmlFor="test-result">Detailed Test Results</Label>
            <textarea
              id="test-result"
              value={result}
              readOnly
              rows={25}
              className="w-full p-3 border rounded-md font-mono text-sm bg-gray-50"
              placeholder="Click 'Test Driver Creation' to see detailed results..."
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}