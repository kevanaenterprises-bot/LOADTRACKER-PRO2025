import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDriverAuth } from "@/hooks/useDriverAuth";

export default function UploadTest() {
  const [result, setResult] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const driverAuth = useDriverAuth();

  const testLogin = async () => {
    setResult("Testing login...");
    try {
      const response = await fetch("/api/driver/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username: "john_doe", password: "1234567890" })
      });
      
      if (response.ok) {
        const data = await response.json();
        setResult(`Login successful: ${JSON.stringify(data)}`);
      } else {
        setResult(`Login failed: ${response.status}`);
      }
    } catch (error) {
      setResult(`Login error: ${error}`);
    }
  };

  const testAuth = async () => {
    setResult("Testing auth check...");
    try {
      const response = await fetch("/api/auth/driver-user", {
        credentials: "include"
      });
      
      if (response.ok) {
        const data = await response.json();
        setResult(`Auth check successful: ${JSON.stringify(data)}`);
      } else {
        setResult(`Auth check failed: ${response.status}`);
      }
    } catch (error) {
      setResult(`Auth check error: ${error}`);
    }
  };

  const testUpload = async () => {
    setResult("Testing upload URL...");
    try {
      const response = await fetch("/api/objects/upload", {
        method: "POST",
        credentials: "include"
      });
      
      if (response.ok) {
        const data = await response.json();
        setResult(`Upload URL successful: ${data.uploadURL.substring(0, 100)}...`);
      } else {
        setResult(`Upload URL failed: ${response.status}`);
      }
    } catch (error) {
      setResult(`Upload URL error: ${error}`);
    }
  };

  const testFileUpload = async () => {
    if (!file) return;
    
    setUploading(true);
    setResult("Starting file upload...");
    
    try {
      // Get upload URL
      const response = await fetch("/api/objects/upload", {
        method: "POST",
        credentials: "include"
      });
      
      if (!response.ok) {
        throw new Error(`Failed to get upload URL: ${response.status}`);
      }
      
      const { uploadURL } = await response.json();
      setResult(`Got upload URL, uploading file...`);
      
      // Upload file
      const uploadResponse = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { 'Content-Type': file.type }
      });
      
      if (uploadResponse.ok) {
        setResult(`File upload successful! URL: ${uploadURL.substring(0, 100)}...`);
      } else {
        setResult(`File upload failed: ${uploadResponse.status}`);
      }
    } catch (error) {
      setResult(`Upload error: ${error}`);
    } finally {
      setUploading(false);
    }
  };

  const [file, setFile] = useState<File | null>(null);

  return (
    <div className="container mx-auto p-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Upload Test Page</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <strong>Auth Status:</strong> {driverAuth.isAuthenticated ? "Authenticated" : "Not authenticated"}
            {driverAuth.user && <div>User: {JSON.stringify(driverAuth.user)}</div>}
          </div>
          
          <div className="flex space-x-2">
            <Button onClick={testLogin}>Test Login</Button>
            <Button onClick={testAuth}>Test Auth Check</Button>
            <Button onClick={testUpload}>Test Upload URL</Button>
          </div>
          
          <div>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="mb-2"
            />
            <Button 
              onClick={testFileUpload} 
              disabled={!file || uploading}
            >
              {uploading ? "Uploading..." : "Test File Upload"}
            </Button>
          </div>
          
          <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-800 rounded">
            <strong>Result:</strong>
            <pre className="whitespace-pre-wrap text-sm">{result}</pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}