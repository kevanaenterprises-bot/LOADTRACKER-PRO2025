import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function AdminTest() {
  const [results, setResults] = useState<string[]>([]);

  const addResult = (message: string) => {
    setResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const testBypassToken = () => {
    addResult("=== BYPASS TOKEN TEST ===");
    const token = localStorage.getItem('bypass-token');
    addResult(`Bypass token in localStorage: ${token ? '✅ EXISTS' : '❌ MISSING'}`);
    if (token) {
      addResult(`Token length: ${token.length} characters`);
      addResult(`Token preview: ${token.substring(0, 20)}...`);
      addResult(`Full token: ${token}`);
    } else {
      addResult("No bypass token found - this might be why dashboard shows white screen");
    }
    addResult("=== END BYPASS TOKEN TEST ===");
  };

  const testAdminAuth = async () => {
    try {
      addResult("=== ADMIN AUTH TEST ===");
      addResult("Testing admin auth endpoint...");
      const bypassToken = localStorage.getItem('bypass-token');
      
      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };
      
      if (bypassToken) {
        headers["x-bypass-token"] = bypassToken;
        addResult("✅ Sending bypass token in headers");
        addResult(`Token being sent: ${bypassToken.substring(0, 20)}...`);
      } else {
        addResult("❌ No bypass token to send - using session auth only");
      }
      
      addResult("Sending request to /api/auth/admin-user...");
      
      const response = await fetch("/api/auth/admin-user", {
        credentials: "include",
        headers
      });
      
      addResult(`Response status: ${response.status} ${response.statusText}`);
      
      if (response.ok) {
        const data = await response.json();
        addResult(`✅ SUCCESS - Admin authenticated!`);
        addResult(`User data: ${JSON.stringify(data, null, 2)}`);
        addResult("This means admin auth is working properly!");
      } else {
        const error = await response.text();
        addResult(`❌ FAILED - Auth rejected`);
        addResult(`Error details: ${error}`);
        addResult("This explains why dashboard might show white screen");
      }
      addResult("=== END ADMIN AUTH TEST ===");
    } catch (error) {
      addResult(`❌ NETWORK ERROR: ${error}`);
      addResult("=== END ADMIN AUTH TEST ===");
    }
  };

  const clearResults = () => setResults([]);

  return (
    <div className="container mx-auto p-4">
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>🧪 Admin Authentication Test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Button onClick={testBypassToken} variant="outline">
              Check Bypass Token
            </Button>
            <Button onClick={testAdminAuth} variant="outline">
              Test Admin Auth
            </Button>
            <Button onClick={clearResults} variant="outline">
              Clear Results
            </Button>
          </div>
          
          <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg max-h-96 overflow-y-auto">
            <h3 className="font-semibold mb-2">Test Results:</h3>
            {results.length === 0 ? (
              <p className="text-gray-500">Click buttons above to run tests</p>
            ) : (
              <div className="space-y-1 font-mono text-sm">
                {results.map((result, index) => (
                  <div key={index} className="whitespace-pre-wrap">
                    {result}
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}