import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, Check, X } from "lucide-react";

interface DirectUploaderProps {
  onUploadComplete?: (uploadUrl: string) => void;
  accept?: string;
  maxFileSize?: number; // in bytes
  className?: string;
}

export function DirectUploader({ 
  onUploadComplete, 
  accept = "image/*",
  maxFileSize = 10 * 1024 * 1024, // 10MB
  className = ""
}: DirectUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleFileUpload = async (file: File) => {
    if (file.size > maxFileSize) {
      setError(`File too large. Maximum size is ${maxFileSize / (1024 * 1024)}MB`);
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(false);
    setProgress(0);

    try {
      // Step 1: Get upload URL
      setProgress(10);
      const response = await fetch("/api/objects/upload", {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`Failed to get upload URL: ${response.status}`);
      }

      const { uploadURL } = await response.json();
      setProgress(30);

      // Step 2: Upload file
      const uploadResponse = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.status}`);
      }

      setProgress(100);
      setSuccess(true);
      onUploadComplete?.(uploadURL);

    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="relative">
        <input
          type="file"
          accept={accept}
          onChange={handleFileSelect}
          disabled={uploading}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          id="file-upload"
        />
        <Button
          variant={success ? "default" : "outline"}
          disabled={uploading}
          className="w-full"
          asChild
        >
          <label htmlFor="file-upload" className="cursor-pointer flex items-center gap-2">
            {uploading ? (
              "Uploading..."
            ) : success ? (
              <>
                <Check className="w-4 h-4" />
                Upload Complete
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Choose File to Upload
              </>
            )}
          </label>
        </Button>
      </div>

      {uploading && (
        <Progress value={progress} className="w-full" />
      )}

      {error && (
        <div className="flex items-center gap-2 text-red-600 text-sm">
          <X className="w-4 h-4" />
          {error}
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 text-green-600 text-sm">
          <Check className="w-4 h-4" />
          File uploaded successfully
        </div>
      )}
    </div>
  );
}