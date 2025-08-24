import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";

import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ObjectUploader } from "@/components/ObjectUploader";
import { BatchPODUpload } from "@/components/BatchPODUpload";

const bolFormSchema = z.object({
  bolNumber: z.string().min(1, "BOL Number is required"),
  tripNumber: z.string().regex(/^\d{4}$/, "Trip number must be 4 digits"),
});

type BOLFormData = z.infer<typeof bolFormSchema>;

interface BOLEntryFormProps {
  load: any;
}

export default function BOLEntryForm({ load }: BOLEntryFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [podUploaded, setPodUploaded] = useState(false);


  const form = useForm<BOLFormData>({
    resolver: zodResolver(bolFormSchema),
    defaultValues: {
      bolNumber: load.bolNumber?.replace(/^374\s?-\s?/, '') || "",
      tripNumber: load.tripNumber || "",
    },
  });

  const validateBOLMutation = useMutation({
    mutationFn: async (bolNumber: string) => {
      console.log("🔍 BOL validation starting for:", bolNumber);
      console.log("🔑 Bypass token available:", !!localStorage.getItem('bypass-token'));
      
      try {
        const result = await apiRequest(`/api/bol/check/${bolNumber}`, "GET");
        console.log("✅ BOL validation successful:", result);
        return result;
      } catch (error) {
        console.error("💥 BOL validation failed:", error);
        throw error;
      }
    },
    onSuccess: (data, bolNumber) => {
      console.log("🎉 BOL validation onSuccess:", { data, bolNumber });
      if (data.exists) {
        toast({
          title: "Duplicate BOL",
          description: "This BOL number already exists. Please verify.",
          variant: "destructive",
        });
        form.setError("bolNumber", { message: "BOL number already exists" });
      } else {
        toast({
          title: "BOL Valid",
          description: "BOL number is available.",
        });
      }
    },
    onError: (error: Error) => {
      console.error("🚨 BOL validation onError:", error);
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "BOL Validation Error",
        description: `Failed to validate BOL: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const updateBOLMutation = useMutation({
    mutationFn: async (data: BOLFormData) => {
      console.log("💾 BOL save starting:", { loadId: load.id, data });
      console.log("🔑 Bypass token available:", !!localStorage.getItem('bypass-token'));
      
      try {
        const result = await apiRequest(`/api/loads/${load.id}/bol`, "PATCH", data);
        console.log("✅ BOL save successful:", result);
        return result;
      } catch (error) {
        console.error("💥 BOL save failed:", error);
        throw error;
      }
    },
    onSuccess: (result) => {
      console.log("🎉 BOL save onSuccess:", result);
      toast({
        title: "Success",
        description: "BOL information updated successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/loads"] });
    },
    onError: (error: Error) => {
      console.error("🚨 BOL save onError:", error);
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "BOL Save Error",
        description: `Failed to save BOL: ${error.message}`,
        variant: "destructive",
      });
    },
  });


  const updatePODMutation = useMutation({
    mutationFn: async (podDocumentURL: string) => {
      await apiRequest("PATCH", `/api/loads/${load.id}/pod`, { podDocumentURL });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "POD document uploaded successfully!",
      });
      setPodUploaded(true);
      queryClient.invalidateQueries({ queryKey: ["/api/loads"] });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to upload POD document",
        variant: "destructive",
      });
    },
  });

  const completeLoadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/loads/${load.id}/complete`, {});
    },
    onSuccess: () => {
      toast({
        title: "Load Completed",
        description: "Load has been completed and invoice generated!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/loads"] });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to complete load",
        variant: "destructive",
      });
    },
  });

  const handleValidateBOL = () => {
    const bolNumber = form.getValues("bolNumber");
    if (bolNumber) {
      // Add "374-" prefix for validation
      const fullBolNumber = `374-${bolNumber}`;
      validateBOLMutation.mutate(fullBolNumber);
    }
  };

  const handleBOLSubmit = (data: BOLFormData) => {
    // Add "374-" prefix before submitting
    const submissionData = {
      ...data,
      bolNumber: `374-${data.bolNumber}`
    };
    updateBOLMutation.mutate(submissionData);
  };

  const handleGetUploadParameters = async () => {
    const response = await fetch("/api/objects/upload", {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error("Failed to get upload parameters");
    }
    const { uploadURL } = await response.json();
    return {
      method: "PUT" as const,
      url: uploadURL,
    };
  };



  const handlePODUploadComplete = (result: any) => {
    if (result.successful && result.successful[0]) {
      const uploadURL = result.successful[0].uploadURL;
      updatePODMutation.mutate(uploadURL);
    }
  };

  const handleCompleteLoad = () => {
    completeLoadMutation.mutate();
  };

  const canShowPODUpload = load.status === "at_receiver" || load.status === "delivered";
  const canCompleteLoad = load.bolNumber && (load.podDocumentPath || podUploaded) && load.status === "delivered";

  return (
    <div className="space-y-6">
      {/* BOL Entry Section */}
      <Card className="material-card">
        <CardHeader>
          <CardTitle>BOL Entry</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleBOLSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="bolNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>374 BOL Number</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-700 font-medium pointer-events-none">
                          374 -
                        </div>
                        <Input 
                          {...field} 
                          placeholder="Enter BOL number"
                          className="pl-14"
                          onChange={(e) => {
                            // Remove any existing "374 -" prefix before setting the value
                            const value = e.target.value.replace(/^374\s?-\s?/, '');
                            field.onChange(value);
                          }}
                          value={field.value?.replace(/^374\s?-\s?/, '') || ''}
                        />
                      </div>
                    </FormControl>
                    <p className="text-xs text-gray-500">
                      This will be checked against existing BOL numbers
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tripNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Trip Number (4 digits)</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="0000" maxLength={4} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={handleValidateBOL}
                  disabled={validateBOLMutation.isPending || !form.watch("bolNumber")}
                >
                  {validateBOLMutation.isPending ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-2"></div>
                      Validating...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-check mr-2"></i>
                      Validate BOL
                    </>
                  )}
                </Button>

                <Button
                  type="submit"
                  className="flex-1"
                  disabled={updateBOLMutation.isPending}
                >
                  {updateBOLMutation.isPending ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Updating...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-save mr-2"></i>
                      Save BOL Info
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>



      {/* POD Upload Section */}
      {canShowPODUpload && (
        <div className="space-y-4">
          {load.podDocumentPath || podUploaded ? (
            <Card className="material-card">
              <CardHeader>
                <CardTitle>POD Upload Complete</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-6">
                  <i className="fas fa-check-circle text-success text-4xl mb-4"></i>
                  <p className="text-success font-medium">POD document(s) uploaded successfully!</p>
                  {load.podDocumentPath && load.podDocumentPath.includes(',') && (
                    <p className="text-sm text-gray-600 mt-2">
                      Multiple pages/documents uploaded
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Batch POD Upload (Recommended for multi-page PODs) */}
              <BatchPODUpload
                loadId={load.id}
                loadNumber={load.number109}
                onUploadComplete={() => {
                  setPodUploaded(true);
                  queryClient.invalidateQueries({ queryKey: ["/api/loads"] });
                }}
              />

              {/* Single POD Upload (Legacy option) */}
              <Card className="material-card border-gray-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-gray-700">Single File Upload</CardTitle>
                  <p className="text-xs text-gray-500">Use this for single-page POD documents only</p>
                </CardHeader>
                <CardContent>
                  <ObjectUploader
                    maxNumberOfFiles={1}
                    maxFileSize={10485760} // 10MB
                    onGetUploadParameters={handleGetUploadParameters}
                    onComplete={handlePODUploadComplete}
                    buttonClassName="w-full"
                  >
                    <div className="flex items-center justify-center">
                      <i className="fas fa-file-upload mr-2"></i>
                      Single POD File
                    </div>
                  </ObjectUploader>
                  {updatePODMutation.isPending && (
                    <div className="mt-4">
                      <div className="flex items-center justify-center space-x-3">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                        <span className="text-sm text-gray-600">Uploading POD document...</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}

      {/* Complete Load Button */}
      {canCompleteLoad && (
        <Button
          className="w-full bg-success hover:bg-green-700"
          size="lg"
          onClick={handleCompleteLoad}
          disabled={completeLoadMutation.isPending}
        >
          {completeLoadMutation.isPending ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Completing Load...
            </>
          ) : (
            <>
              <i className="fas fa-check-circle mr-2"></i>
              Complete Load & Generate Invoice
            </>
          )}
        </Button>
      )}
    </div>
  );
}
