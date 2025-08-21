import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function QuickDriverAssignTest() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const testAssignment = async () => {
    setLoading(true);
    try {
      // Get bypass token first
      const authResponse = await fetch("/api/auth/browser-bypass", {
        method: "POST",
        credentials: "include",
      });
      
      if (!authResponse.ok) {
        throw new Error("Failed to get bypass token");
      }
      
      const authResult = await authResponse.json();
      const token = authResult.token;
      
      // Store token
      localStorage.setItem('bypass-token', token);
      
      console.log("Got bypass token:", token);
      
      // Test driver assignment
      const assignResponse = await fetch("/api/loads/5fac985a-8dc7-49ee-b207-164e32a08da3/assign-driver", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Bypass-Token": token,
        },
        credentials: "include",
        body: JSON.stringify({ 
          driverId: "56bc6d44-74d9-4966-beb8-696f20dc18b6" 
        }),
      });
      
      const assignResult = await assignResponse.json();
      
      if (assignResponse.ok) {
        toast({
          title: "Driver Assignment Successful",
          description: `${assignResult.driver?.firstName || 'Driver'} assigned to load ${assignResult.number109}`,
        });
      } else {
        toast({
          title: "Assignment Failed",
          description: assignResult.message || "Unknown error",
          variant: "destructive",
        });
      }
      
      console.log("Assignment result:", { 
        status: assignResponse.status, 
        result: assignResult 
      });
      
    } catch (error) {
      console.error("Test error:", error);
      toast({
        title: "Test Failed",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto mt-10 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Quick Driver Assignment Test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>This page tests driver assignment with direct API calls using bypass authentication.</p>
          
          <Button 
            onClick={testAssignment}
            disabled={loading}
            className="w-full"
          >
            {loading ? "Testing Assignment..." : "Test Driver Assignment"}
          </Button>
          
          <div className="text-sm text-gray-600">
            <p><strong>What this test does:</strong></p>
            <ul className="list-disc list-inside space-y-1">
              <li>Gets bypass authentication token</li>
              <li>Assigns John Smith to test load 5fac985a</li>
              <li>Shows success/error message</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}