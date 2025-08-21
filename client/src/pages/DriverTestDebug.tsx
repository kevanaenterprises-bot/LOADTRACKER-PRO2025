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
      
      // Step 3: Test locations fetch
      setResult(prev => prev + "Step 3: Testing locations fetch...\n");
      const locationsResponse = await fetch("/api/locations", {
        headers: { "X-Bypass-Token": token },
        credentials: "include",
      });
      
      setResult(prev => prev + `Locations response status: ${locationsResponse.status}\n`);
      if (locationsResponse.ok) {
        const locationsData = await locationsResponse.json();
        setResult(prev => prev + `✓ Found ${locationsData.length} locations\n`);
        setResult(prev => prev + `First location: ${locationsData[0]?.name}\n`);
      } else {
        const locationsError = await locationsResponse.text();
        setResult(prev => prev + `✗ Locations fetch failed: ${locationsError}\n`);
      }
      
      // Step 4: Test load creation
      setResult(prev => prev + "Step 4: Testing load creation...\n");
      const loadData = {
        number109: `TEST-${Date.now()}`,
        locationId: "d934f547-7ca5-447d-b30b-759629ce9e81", // ACW Warehouse
        estimatedMiles: 500,
        specialInstructions: "Test load",
        status: "created"
      };
      
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
        setResult(prev => prev + `✓ Load created successfully: ${loadResult.number109}\n`);
      } else {
        const loadError = await loadResponse.text();
        setResult(prev => prev + `✗ Load creation failed: ${loadError}\n`);
      }
      
      // Step 5: Test dashboard-style driver creation (same as real form)
      setResult(prev => prev + "Step 5: Testing dashboard driver creation (real API flow)...\n");
      
      // Import the same apiRequest function the dashboard uses
      const { apiRequest } = await import("@/lib/queryClient");
      
      const driverData = {
        firstName: "Dashboard",
        lastName: "Test",
        phoneNumber: "1234567890",
        username: `dashboard_driver_${Date.now()}`,
        role: "driver"
      };
      
      setResult(prev => prev + `Testing with apiRequest (same as dashboard): ${JSON.stringify(driverData, null, 2)}\n`);
      
      try {
        const driverResult = await apiRequest("/api/drivers", "POST", driverData);
        setResult(prev => prev + `🎉 SUCCESS! Dashboard-style driver created: ${driverResult.username}\n`);
        setResult(prev => prev + `Driver ID: ${driverResult.id}\n`);
        toast({
          title: "SUCCESS!",
          description: "Dashboard driver creation working!"
        });
      } catch (error: any) {
        setResult(prev => prev + `✗ Dashboard driver creation failed:\n`);
        setResult(prev => prev + `Error: ${error.message}\n`);
        
        // Also test with manual bypass token as fallback
        setResult(prev => prev + "Fallback: Testing with manual bypass token...\n");
        const driverResponse = await fetch("/api/drivers", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "X-Bypass-Token": token
          },
          body: JSON.stringify({
            ...driverData,
            username: `fallback_driver_${Date.now()}`
          }),
          credentials: "include",
        });
        
        if (driverResponse.ok) {
          const fallbackResult = await driverResponse.json();
          setResult(prev => prev + `✓ Fallback bypass token worked: ${fallbackResult.username}\n`);
        } else {
          const errorText = await driverResponse.text();
          setResult(prev => prev + `✗ Even bypass token failed: ${errorText}\n`);
        }
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