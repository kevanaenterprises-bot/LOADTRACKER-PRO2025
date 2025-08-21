import { useState } from "react";
import { useDriverAuth } from "@/hooks/useDriverAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function DebugUpload() {
  const driverAuth = useDriverAuth();
  const [testResult, setTestResult] = useState<string>("");

  const testAuth = async () => {
    try {
      const response = await fetch("/api/auth/driver-user", {
        credentials: "include",
      });
      const result = await response.text();
      setTestResult(`Auth test: ${response.status} - ${result}`);
    } catch (error) {
      setTestResult(`Auth test error: ${error}`);
    }
  };

  const testUploadURL = async () => {
    try {
      const response = await fetch("/api/objects/upload", {
        method: "POST",
        credentials: "include",
      });
      const result = await response.text();
      setTestResult(`Upload URL test: ${response.status} - ${result}`);
    } catch (error) {
      setTestResult(`Upload URL test error: ${error}`);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload Debug Page</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-semibold">Driver Auth Status</h3>
            <pre className="bg-gray-100 p-2 rounded text-sm">
              {JSON.stringify({
                isAuthenticated: driverAuth.isAuthenticated,
                isLoading: driverAuth.isLoading,
                user: driverAuth.user
              }, null, 2)}
            </pre>
          </div>
          
          <div className="space-x-2">
            <Button onClick={testAuth}>Test Auth</Button>
            <Button onClick={testUploadURL}>Test Upload URL</Button>
          </div>
          
          {testResult && (
            <div>
              <h3 className="font-semibold">Test Result</h3>
              <pre className="bg-gray-100 p-2 rounded text-sm whitespace-pre-wrap">
                {testResult}
              </pre>
            </div>
          )}
          
          <div>
            <h3 className="font-semibold">Instructions</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm">
              <li>First click "Test Auth" to check if you're logged in as a driver</li>
              <li>If not authenticated, go to <a href="/driver-login" className="text-blue-500">/driver-login</a></li>
              <li>Login with: john_doe / 1234567890</li>
              <li>Come back here and test again</li>
              <li>Then click "Test Upload URL" to verify upload endpoint works</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}