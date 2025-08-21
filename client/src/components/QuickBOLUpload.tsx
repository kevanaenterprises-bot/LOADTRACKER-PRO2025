import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ObjectUploader } from "@/components/ObjectUploader";
import { isUnauthorizedError } from "@/lib/authUtils";

interface QuickBOLUploadProps {
  currentLoad?: any;
}

export default function QuickBOLUpload({ currentLoad }: QuickBOLUploadProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const updateBOLDocumentMutation = useMutation({
    mutationFn: async (uploadURL: string) => {
      if (!currentLoad?.id) {
        throw new Error("No active load found");
      }
      
      const response = await fetch(`/api/loads/${currentLoad.id}/bol-document`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ bolDocumentURL: uploadURL }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Failed to update load: ${errorData}`);
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "BOL document uploaded successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/driver/loads"] });
      setUploading(false);
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/driver-login";
        }, 500);
        return;
      }
      
      toast({
        title: "Error",
        description: error.message || "Failed to update BOL document",
        variant: "destructive",
      });
      setUploading(false);
    },
  });

  const handleGetUploadParameters = async () => {
    const response = await fetch("/api/objects/upload", {
      method: "POST",
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Failed to get upload URL");
    }

    const data = await response.json();
    return {
      method: "PUT" as const,
      url: data.uploadURL,
    };
  };

  const handleUploadComplete = (result: any) => {
    if (result.successful && result.successful[0]) {
      const uploadURL = result.successful[0].uploadURL;
      updateBOLDocumentMutation.mutate(uploadURL);
    }
  };

  const handleUploadStart = () => {
    setUploading(true);
  };

  if (!currentLoad) {
    return (
      <Card className="material-card border-l-4 border-l-yellow-500">
        <CardContent className="pt-6">
          <div className="text-center">
            <i className="fas fa-info-circle text-yellow-500 text-2xl mb-2"></i>
            <p className="text-sm text-gray-600">No active loads - BOL upload not available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (currentLoad.bolDocumentPath) {
    return (
      <Card className="material-card border-l-4 border-l-green-500">
        <CardContent className="pt-6">
          <div className="text-center">
            <i className="fas fa-check-circle text-green-500 text-2xl mb-2"></i>
            <p className="text-sm font-medium text-green-700">BOL document uploaded for Load #{currentLoad.loadNumber}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="material-card border-l-4 border-l-blue-500">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center">
          <i className="fas fa-camera mr-2 text-blue-500"></i>
          Upload BOL for Load #{currentLoad.loadNumber}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            <strong>{currentLoad.pickupLocation}</strong> → <strong>{currentLoad.deliveryLocation}</strong>
          </p>
          
          {uploading || updateBOLDocumentMutation.isPending ? (
            <div className="text-center py-4">
              <div className="flex items-center justify-center space-x-3">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                <span className="text-sm text-gray-600">
                  {uploading ? "Uploading BOL document..." : "Saving to load..."}
                </span>
              </div>
            </div>
          ) : (
            <ObjectUploader
              maxNumberOfFiles={1}
              maxFileSize={10485760} // 10MB
              onGetUploadParameters={handleGetUploadParameters}
              onComplete={handleUploadComplete}
              buttonClassName="w-full bg-blue-500 hover:bg-blue-600 text-white py-3"
            >
              <div className="flex items-center justify-center space-x-2">
                <i className="fas fa-camera text-lg"></i>
                <span className="font-medium">Take Photo / Upload BOL</span>
              </div>
            </ObjectUploader>
          )}
        </div>
      </CardContent>
    </Card>
  );
}