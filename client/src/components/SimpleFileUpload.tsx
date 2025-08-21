import { useState } from "react";
import { Input } from "@/components/ui/input";

interface SimpleFileUploadProps {
  onUploadComplete: (url: string) => void;
  loadId?: string;
}

export function SimpleFileUpload({ onUploadComplete, loadId }: SimpleFileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  const handleUpload = async (file: File) => {
    if (!file) return;
    
    setUploading(true);
    setMessage("Starting upload...");

    try {
      // Get upload URL
      setMessage("Getting upload URL...");
      const urlResponse = await fetch("/api/objects/upload", {
        method: "POST",
        credentials: "include",
      });

      if (!urlResponse.ok) {
        throw new Error(`Auth failed: ${urlResponse.status}`);
      }

      const { uploadURL } = await urlResponse.json();
      setMessage("Uploading file...");

      // Upload file
      const uploadResponse = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.status}`);
      }

      setMessage("Updating load record...");
      
      // Update load with BOL document if loadId provided
      if (loadId) {
        const updateResponse = await fetch(`/api/loads/${loadId}/bol-document`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bolDocumentURL: uploadURL }),
        });

        if (!updateResponse.ok) {
          throw new Error(`Load update failed: ${updateResponse.status}`);
        }
      }

      setMessage("Upload successful!");
      onUploadComplete(uploadURL);
      
    } catch (error) {
      setMessage(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      <Input
        type="file"
        accept="image/*,.pdf"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
        }}
        disabled={uploading}
      />
      
      {message && (
        <div className={`text-sm p-2 rounded ${
          message.includes("Error") 
            ? "bg-red-100 text-red-700" 
            : message.includes("successful") 
            ? "bg-green-100 text-green-700"
            : "bg-blue-100 text-blue-700"
        }`}>
          {uploading && <span className="animate-pulse">⏳ </span>}
          {message}
        </div>
      )}
      
      {uploading && (
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div className="bg-blue-600 h-2 rounded-full animate-pulse w-1/2"></div>
        </div>
      )}
    </div>
  );
}