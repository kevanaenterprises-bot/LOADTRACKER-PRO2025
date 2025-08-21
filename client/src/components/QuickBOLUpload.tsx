import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useDriverAuth } from "@/hooks/useDriverAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DirectUploader } from "@/components/DirectUploader";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Check } from "lucide-react";

interface QuickBOLUploadProps {
  currentLoad?: any;
  allLoads?: any[];
}

export default function QuickBOLUpload({ currentLoad, allLoads = [] }: QuickBOLUploadProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [selectedLoadId, setSelectedLoadId] = useState<string | null>(null);
  const driverAuth = useDriverAuth();
  
  // Debug authentication status
  console.log("QuickBOLUpload: Auth status:", {
    isAuthenticated: driverAuth.isAuthenticated,
    isLoading: driverAuth.isLoading,
    user: driverAuth.user
  });

  // Find loads that have BOL numbers but no BOL documents
  const loadsNeedingBOL = allLoads.filter(load => 
    load.bolNumber && !load.bolDocumentPath
  );

  // If there's a current load that needs BOL, prioritize it
  const priorityLoad = currentLoad && loadsNeedingBOL.find(load => load.id === currentLoad.id);
  const defaultLoadId = priorityLoad?.id || loadsNeedingBOL[0]?.id || null;

  const activeLoadId = selectedLoadId || defaultLoadId;
  const activeLoad = allLoads.find(load => load.id === activeLoadId);

  const updateBOLDocumentMutation = useMutation({
    mutationFn: async (uploadURL: string) => {
      if (!activeLoadId) {
        throw new Error("No load selected");
      }
      
      const response = await fetch(`/api/loads/${activeLoadId}/bol-document`, {
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
      setSelectedLoadId(null); // Reset selection
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
    try {
      console.log("QuickBOLUpload: Getting upload parameters...");
      console.log("QuickBOLUpload: Current auth state:", {
        isAuthenticated: driverAuth.isAuthenticated,
        user: driverAuth.user
      });
      
      // First check if we're authenticated
      if (!driverAuth.isAuthenticated) {
        console.error("QuickBOLUpload: Not authenticated as driver");
        throw new Error("Not authenticated as driver. Please log in first.");
      }
      
      const response = await fetch("/api/objects/upload", {
        method: "POST",
        credentials: "include",
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log("QuickBOLUpload: Upload URL response status:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("QuickBOLUpload: Failed to get upload URL:", response.status, errorText);
        throw new Error(`Failed to get upload URL: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      console.log("QuickBOLUpload: Upload parameters received:", data);
      return {
        method: "PUT" as const,
        url: data.uploadURL,
      };
    } catch (error) {
      console.error("QuickBOLUpload: Error in handleGetUploadParameters:", error);
      throw error;
    }
  };

  const handleUploadComplete = (result: any) => {
    console.log("QuickBOLUpload: Upload complete result:", result);
    
    // Show detailed error information
    if (result.failed && result.failed.length > 0) {
      console.error("QuickBOLUpload: Failed uploads:", result.failed);
      result.failed.forEach((failure: any, index: number) => {
        console.error(`QuickBOLUpload: Failure ${index + 1}:`, {
          file: failure.file?.name,
          error: failure.error,
          response: failure.response
        });
      });
      
      const errorMessage = result.failed[0]?.error?.message || "Upload failed";
      toast({
        title: "Upload Failed",
        description: errorMessage,
        variant: "destructive",
      });
      setUploading(false);
      return;
    }
    
    if (result.successful && result.successful[0]) {
      const uploadURL = result.successful[0].uploadURL;
      console.log("QuickBOLUpload: Updating BOL document with URL:", uploadURL);
      updateBOLDocumentMutation.mutate(uploadURL);
    } else {
      console.error("QuickBOLUpload: No successful uploads in result:", result);
      toast({
        title: "Error",
        description: "Upload failed - no successful files",
        variant: "destructive",
      });
      setUploading(false);
    }
  };

  const handleUploadStart = () => {
    console.log("QuickBOLUpload: Upload started");
    setUploading(true);
  };

  // Show authentication status for debugging
  if (!driverAuth.isAuthenticated) {
    return (
      <Card className="material-card border-l-4 border-l-red-500">
        <CardContent className="pt-6">
          <div className="text-center">
            <i className="fas fa-exclamation-triangle text-red-500 text-2xl mb-2"></i>
            <p className="text-sm font-medium text-red-700">Not Logged In</p>
            <p className="text-xs text-gray-600 mt-1">You must be logged in as a driver to upload BOL documents</p>
            <Button 
              className="mt-3 text-xs" 
              size="sm"
              onClick={() => window.location.href = "/driver-login"}
            >
              Go to Driver Login
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loadsNeedingBOL.length === 0) {
    return (
      <Card className="material-card border-l-4 border-l-green-500">
        <CardContent className="pt-6">
          <div className="text-center">
            <i className="fas fa-check-circle text-green-500 text-2xl mb-2"></i>
            <p className="text-sm font-medium text-green-700">All BOL documents uploaded!</p>
            <p className="text-xs text-gray-600 mt-1">No loads need BOL photos</p>
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
          Upload BOL Document ({loadsNeedingBOL.length} load{loadsNeedingBOL.length !== 1 ? 's' : ''} need BOL photos)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Load Selection Dropdown (if multiple loads) */}
          {loadsNeedingBOL.length > 1 && (
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Select Load:
              </label>
              <select 
                value={activeLoadId || ''} 
                onChange={(e) => setSelectedLoadId(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md bg-white text-sm"
              >
                {loadsNeedingBOL.map((load) => (
                  <option key={load.id} value={load.id}>
                    Load #{load.loadNumber || load.number109} - BOL: {load.bolNumber}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Active Load Info */}
          {activeLoad && (
            <div className="bg-gray-50 p-3 rounded-md">
              <div className="text-sm font-medium text-gray-900">
                Load #{activeLoad.loadNumber || activeLoad.number109}
              </div>
              <div className="text-sm text-gray-600">
                BOL: <strong>{activeLoad.bolNumber}</strong>
              </div>
              <div className="text-sm text-gray-600">
                <strong>{activeLoad.pickupLocation}</strong> → <strong>{activeLoad.deliveryLocation}</strong>
              </div>
            </div>
          )}
          
          {/* Upload Section */}
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
            <div className="space-y-3">
              <DirectUploader
                accept="image/*,.pdf"
                maxFileSize={10485760} // 10MB
                onUploadComplete={(uploadUrl) => {
                  console.log("QuickBOLUpload: DirectUploader completed with URL:", uploadUrl);
                  updateBOLDocumentMutation.mutate(uploadUrl);
                }}
                className="w-full"
              />
              {updateBOLDocumentMutation.isPending && (
                <div className="text-sm text-blue-600 flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                  <span>Updating load record...</span>
                </div>
              )}
              {updateBOLDocumentMutation.isSuccess && (
                <div className="text-sm text-green-600 flex items-center space-x-2">
                  <Check className="h-4 w-4" />
                  <span>BOL document saved successfully!</span>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}