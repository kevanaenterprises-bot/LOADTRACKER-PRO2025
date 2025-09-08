import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useDriverAuth } from "@/hooks/useDriverAuth";

export default function QuickUploadPage() {
  const [status, setStatus] = useState("");
  const driverAuth = useDriverAuth();

  const doLogin = async () => {
    setStatus("Logging in...");
    try {
      const response = await fetch("/api/driver/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username: "john_doe", password: "1234567890" }),
      });
      
      if (response.ok) {
        setStatus("Login successful! Redirecting...");
        window.location.href = "/driver-portal";
      } else {
        setStatus("Login failed");
      }
    } catch (error) {
      setStatus(`Login error: ${error}`);
    }
  };

  const uploadFile = async (file: File) => {
    setStatus("Starting upload...");
    
    try {
      // Get upload URL
      const urlResponse = await fetch("/api/objects/upload", {
        method: "POST",
        credentials: "include",
      });

      if (!urlResponse.ok) {
        throw new Error(`Failed to get upload URL: ${urlResponse.status}`);
      }

      const { uploadURL } = await urlResponse.json();
      setStatus("Got upload URL, uploading file...");

      // Upload file
      const uploadResponse = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      if (uploadResponse.ok) {
        setStatus("Upload successful!");
      } else {
        setStatus(`Upload failed: ${uploadResponse.status}`);
      }
    } catch (error) {
      setStatus(`Error: ${error}`);
    }
  };

  return (
    <div className="container mx-auto p-8">
      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Quick Upload Test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm">
            Auth Status: {driverAuth.isAuthenticated ? "✅ Authenticated" : "❌ Not authenticated"}
          </div>
          
          {!driverAuth.isAuthenticated && (
            <Button onClick={doLogin} className="w-full">
              Login as Driver
            </Button>
          )}
          
          {driverAuth.isAuthenticated && (
            <div>
              <input
                type="file"
                accept="image/*,.heic,.heif"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadFile(file);
                }}
                className="w-full p-2 border rounded"
              />
            </div>
          )}
          
          {status && (
            <div className="p-3 bg-gray-100 rounded text-sm">
              {status}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}