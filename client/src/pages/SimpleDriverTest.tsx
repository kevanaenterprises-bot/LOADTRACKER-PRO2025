import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function SimpleDriverTest() {
  const [bolNumber, setBolNumber] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  const testBOLValidation = async () => {
    setLoading(true);
    try {
      console.log("🔍 Simple test: Validating BOL:", bolNumber);
      
      // Direct API call with bypass token
      const response = await fetch(`/api/bol/check/${bolNumber}`, {
        method: "GET",
        headers: {
          "X-Bypass-Token": "LOADTRACKER_BYPASS_2025",
          "Content-Type": "application/json"
        },
        credentials: "include"
      });
      
      console.log("📊 Response status:", response.status);
      console.log("📊 Response headers:", response.headers);
      
      if (response.ok) {
        const data = await response.json();
        console.log("✅ Success:", data);
        setResult(`SUCCESS: BOL exists: ${data.exists}`);
      } else {
        const errorText = await response.text();
        console.log("❌ Error:", errorText);
        setResult(`ERROR ${response.status}: ${errorText}`);
      }
    } catch (error) {
      console.error("💥 Exception:", error);
      setResult(`EXCEPTION: ${error instanceof Error ? error.message : String(error)}`);
    }
    setLoading(false);
  };

  const testStatusUpdate = async () => {
    setLoading(true);
    try {
      console.log("🚀 Simple test: Updating status");
      
      // Direct API call with bypass token - use the test load
      const response = await fetch(`/api/loads/2703d8c2-7c65-46aa-8570-cd14cdada925/status`, {
        method: "PATCH",
        headers: {
          "X-Bypass-Token": "LOADTRACKER_BYPASS_2025",
          "Content-Type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify({ status: "at_shipper" })
      });
      
      console.log("📊 Status response:", response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log("✅ Status success:", data);
        setResult(`STATUS SUCCESS: Updated to ${data.status}`);
      } else {
        const errorText = await response.text();
        console.log("❌ Status error:", errorText);
        setResult(`STATUS ERROR ${response.status}: ${errorText}`);
      }
    } catch (error) {
      console.error("💥 Status exception:", error);
      setResult(`STATUS EXCEPTION: ${error instanceof Error ? error.message : String(error)}`);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow p-6">
        <h1 className="text-xl font-bold mb-4">Simple Driver Test</h1>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">BOL Number:</label>
            <Input
              value={bolNumber}
              onChange={(e) => setBolNumber(e.target.value)}
              placeholder="Enter BOL number"
            />
          </div>
          
          <div className="space-y-2">
            <Button 
              onClick={testBOLValidation}
              disabled={loading || !bolNumber}
              className="w-full"
            >
              {loading ? "Testing..." : "Test BOL Validation"}
            </Button>
            
            <Button 
              onClick={testStatusUpdate}
              disabled={loading}
              className="w-full"
              variant="outline"
            >
              {loading ? "Testing..." : "Test Status Update"}
            </Button>
          </div>
          
          {result && (
            <div className={`p-3 rounded text-sm ${
              result.startsWith('SUCCESS') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}>
              {result}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}