import { useState } from "react";
import { useDriverAuth } from "@/hooks/useDriverAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function SimpleUploadTest() {
  const driverAuth = useDriverAuth();
  const [status, setStatus] = useState<string>("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const testDirectUpload = async () => {
    if (!uploadFile) {
      setStatus("Please select a file first");
      return;
    }

    try {
      setStatus("Step 1: Getting upload URL...");
      
      // Get upload URL
      const response = await fetch("/api/objects/upload", {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        const errorText = await response.text();
        setStatus(`Failed to get upload URL: ${response.status} - ${errorText}`);
        return;
      }

      const { uploadURL } = await response.json();
      setStatus(`Step 2: Got upload URL, uploading file...`);

      // Upload file directly
      const uploadResponse = await fetch(uploadURL, {
        method: "PUT",
        body: uploadFile,
        headers: {
          'Content-Type': uploadFile.type || 'application/octet-stream',
        },
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        setStatus(`Upload failed: ${uploadResponse.status} - ${errorText}`);
        return;
      }

      setStatus(`SUCCESS! File uploaded. Upload URL: ${uploadURL}`);
    } catch (error) {
      setStatus(`Error: ${error}`);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadFile(file);
      setStatus(`File selected: ${file.name} (${file.size} bytes)`);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Simple Upload Test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-semibold">Authentication Status</h3>
            <div className="bg-gray-100 p-2 rounded text-sm">
              {driverAuth.isAuthenticated ? (
                <span className="text-green-600">✅ Logged in as: {driverAuth.user?.username}</span>
              ) : (
                <span className="text-red-600">❌ Not logged in as driver</span>
              )}
            </div>
          </div>

          {!driverAuth.isAuthenticated && (
            <div className="bg-yellow-50 border border-yellow-200 p-3 rounded">
              <p className="text-sm">You must be logged in as a driver first.</p>
              <Button 
                size="sm" 
                className="mt-2"
                onClick={() => window.location.href = "/driver-login"}
              >
                Go to Driver Login
              </Button>
            </div>
          )}

          {driverAuth.isAuthenticated && (
            <>
              <div>
                <h3 className="font-semibold mb-2">Select File to Upload</h3>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="border border-gray-300 rounded p-2 w-full"
                />
              </div>

              <Button 
                onClick={testDirectUpload}
                disabled={!uploadFile}
                className="w-full"
              >
                Test Direct Upload
              </Button>
            </>
          )}

          {status && (
            <div>
              <h3 className="font-semibold">Status</h3>
              <div className="bg-gray-100 p-2 rounded text-sm whitespace-pre-wrap">
                {status}
              </div>
            </div>
          )}

          <div className="text-xs text-gray-500">
            <p>This test bypasses the Uppy library and uploads directly to verify the basic upload flow works.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}