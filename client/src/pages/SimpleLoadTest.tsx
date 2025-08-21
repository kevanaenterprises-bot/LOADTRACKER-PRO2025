import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function SimpleLoadTest() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState("");
  const { toast } = useToast();

  const testLoadCreation = async () => {
    setIsLoading(true);
    setResult("Testing load creation...\n");
    
    try {
      // Step 1: Get bypass token
      setResult(prev => prev + "Step 1: Getting bypass token...\n");
      const bypassResponse = await fetch("/api/auth/browser-bypass", {
        method: "POST",
        credentials: "include",
      });
      
      let token = "";
      if (bypassResponse.ok) {
        const data = await bypassResponse.json();
        token = data.token;
        setResult(prev => prev + `Got token: ${token.substring(0, 20)}...\n`);
      } else {
        setResult(prev => prev + "Failed to get bypass token\n");
      }
      
      // Step 2: Try admin login
      setResult(prev => prev + "Step 2: Admin login...\n");
      const loginResponse = await fetch("/api/auth/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "go4fc2024" }),
        credentials: "include",
      });
      
      if (loginResponse.ok) {
        setResult(prev => prev + "Admin login successful\n");
      } else {
        const loginError = await loginResponse.json();
        setResult(prev => prev + `Admin login failed: ${loginError.message}\n`);
      }
      
      // Step 3: Create load with all methods
      setResult(prev => prev + "Step 3: Creating load with bypass token...\n");
      const loadResponse = await fetch("/api/loads", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-Bypass-Token": token
        },
        body: JSON.stringify({
          number109: `SIMPLE-${Date.now()}`,
          locationId: "d934f547-7ca5-447d-b30b-759629ce9e81",
          estimatedMiles: 100,
          specialInstructions: "Simple test load",
          status: "created"
        }),
        credentials: "include",
      });
      
      if (loadResponse.ok) {
        const loadData = await loadResponse.json();
        setResult(prev => prev + `SUCCESS! Load created: ${loadData.number109}\n`);
        toast({
          title: "Success!",
          description: "Load created successfully!"
        });
      } else {
        const loadError = await loadResponse.text();
        setResult(prev => prev + `Load creation failed: ${loadResponse.status} - ${loadError}\n`);
      }
      
    } catch (error) {
      setResult(prev => prev + `ERROR: ${error}\n`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Simple Load Creation Test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button 
            onClick={testLoadCreation} 
            disabled={isLoading}
            className="w-full"
            size="lg"
          >
            {isLoading ? "Testing..." : "Test Load Creation"}
          </Button>
          
          <div>
            <Label htmlFor="test-result">Test Result</Label>
            <textarea
              id="test-result"
              value={result}
              readOnly
              rows={15}
              className="w-full p-3 border rounded-md font-mono text-sm bg-gray-50"
              placeholder="Click 'Test Load Creation' to see results..."
            />
          </div>
          
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-800 mb-2">Instructions:</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-blue-700">
              <li>Access this page on your production site: /simple-load-test</li>
              <li>Click "Test Load Creation" to run the complete test</li>
              <li>Watch the detailed step-by-step process</li>
              <li>Copy the results and share them to diagnose the exact issue</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}