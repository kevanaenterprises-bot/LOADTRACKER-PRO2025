import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import { ObjectUploader } from "@/components/ObjectUploader";
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
      bolNumber: load.bolNumber || "",
      tripNumber: load.tripNumber || "",
    },
  });

  const validateBOLMutation = useMutation({
    mutationFn: async (bolNumber: string) => {
      const response = await fetch(`/api/bol/check/${bolNumber}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to validate BOL");
      }
      return response.json();
    },
    onSuccess: (data, bolNumber) => {
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
        description: "Failed to validate BOL number",
        variant: "destructive",
      });
    },
  });

  const updateBOLMutation = useMutation({
    mutationFn: async (data: BOLFormData) => {
      await apiRequest("PATCH", `/api/loads/${load.id}/bol`, data);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "BOL information updated successfully!",
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
        description: error.message || "Failed to update BOL information",
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
      validateBOLMutation.mutate(bolNumber);
    }
  };

  const handleBOLSubmit = (data: BOLFormData) => {
    updateBOLMutation.mutate(data);
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
                      <Input {...field} placeholder="Enter 374 BOL number" />
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
        <Card className="material-card">
          <CardHeader>
            <CardTitle>Upload POD</CardTitle>
          </CardHeader>
          <CardContent>
            {load.podDocumentPath || podUploaded ? (
              <div className="text-center py-6">
                <i className="fas fa-check-circle text-success text-4xl mb-4"></i>
                <p className="text-success font-medium">POD document uploaded successfully!</p>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-4">Upload signed Proof of Delivery</p>
                <ObjectUploader
                  maxNumberOfFiles={1}
                  maxFileSize={10485760} // 10MB
                  onGetUploadParameters={handleGetUploadParameters}
                  onComplete={handlePODUploadComplete}
                  buttonClassName="w-full"
                >
                  <div className="flex items-center justify-center">
                    <i className="fas fa-cloud-upload-alt mr-2"></i>
                    Choose POD File
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
              </div>
            )}
          </CardContent>
        </Card>
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
