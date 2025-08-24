import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { SimpleFileUpload } from "@/components/SimpleFileUpload";
import { apiRequest } from "@/lib/queryClient";

const bolUploadSchema = z.object({
  loadNumber: z.string().min(1, "Load number is required"),
  bolNumber: z.string().min(1, "BOL number is required"), 
  tripNumber: z.string().min(1, "Trip number is required"),
});

type BOLUploadData = z.infer<typeof bolUploadSchema>;

export default function StandaloneBOLUpload() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [readyForUpload, setReadyForUpload] = useState(false);
  const [loadId, setLoadId] = useState<string | null>(null);

  const form = useForm<BOLUploadData>({
    resolver: zodResolver(bolUploadSchema),
    defaultValues: {
      loadNumber: "", // Start empty - drivers can enter any format
      bolNumber: "374-", // Keep 374- default but allow override
      tripNumber: "",
    },
  });

  const findLoadMutation = useMutation({
    mutationFn: async (data: BOLUploadData) => {
      // Find the load by primary load number (works with any format: 109-12345, ABC-5678, etc.)
      const loadResponse = await apiRequest(`/api/loads/by-number/${data.loadNumber}`, "GET");
      
      if (!loadResponse) {
        throw new Error(`Load ${data.loadNumber} not found`);
      }

      // Check if BOL number already exists for OTHER loads (exclude current load)
      const bolCheckResponse = await apiRequest(
        `/api/bol/check/${data.bolNumber}?excludeLoadId=${loadResponse.id}`, 
        "GET"
      );
      
      if (bolCheckResponse?.exists) {
        throw new Error(`BOL number ${data.bolNumber} has already been used by another load`);
      }

      // Update the load with BOL information
      const updateResponse = await apiRequest(`/api/loads/${loadResponse.id}/bol`, "PATCH", {
        bolNumber: data.bolNumber,
        tripNumber: data.tripNumber,
      });

      return { loadId: loadResponse.id, load: updateResponse };
    },
    onSuccess: (data) => {
      setLoadId(data.loadId);
      setReadyForUpload(true);
      toast({
        title: "Load Found",
        description: "Load information updated. Now upload your BOL photo.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: BOLUploadData) => {
    findLoadMutation.mutate(data);
  };

  const handleUploadComplete = () => {
    toast({
      title: "Success",
      description: "BOL photo uploaded successfully!",
    });
    queryClient.invalidateQueries({ queryKey: ["/api/driver/loads"] });
    
    // Reset form with prefixes
    form.reset({
      loadNumber: "109-",
      bolNumber: "374-",
      tripNumber: "",
    });
    setReadyForUpload(false);
    setLoadId(null);
    setUploading(false);
  };

  return (
    <Card className="material-card border-l-4 border-l-blue-500">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center">
          <i className="fas fa-camera mr-2 text-blue-500"></i>
          Upload BOL Photo
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {!readyForUpload ? (
            <>
              <p className="text-sm text-gray-600 mb-4">
                Enter your load details to upload a BOL photo. Works with any load number format (109-12345, ABC-5678, etc.):
              </p>
              
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="loadNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Load Number (Primary ID)</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="109-36205, ABC-5678, XYZ-999, etc." 
                            {...field}
                            className="text-sm"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="bolNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>BOL Number</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="374-22222, BOL-5678, etc." 
                            {...field}
                            className="text-sm"
                            onFocus={(e) => {
                              // If field only contains default prefix, select all for easy override
                              if (e.target.value === "374-") {
                                e.target.select();
                              }
                            }}
                          />
                        </FormControl>
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
                          <Input 
                            placeholder="5469" 
                            {...field}
                            maxLength={4}
                            className="text-sm"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <Button 
                    type="submit" 
                    className="w-full bg-blue-600 hover:bg-blue-700"
                    disabled={findLoadMutation.isPending}
                  >
                    {findLoadMutation.isPending ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Validating Load...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-check mr-2"></i>
                        Validate BOL & Prepare Upload
                      </>
                    )}
                  </Button>
                </form>
              </Form>
            </>
          ) : (
            <>
              <div className="text-center py-6">
                <div className="bg-green-100 text-green-800 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                  <i className="fas fa-check text-2xl"></i>
                </div>
                <h3 className="text-lg font-semibold text-green-800 mb-2">Load Validated Successfully!</h3>
                <p className="text-sm text-green-700 mb-4">
                  Load {form.watch("loadNumber")} found and BOL information updated.
                  <br />
                  Now upload your BOL photo to complete the process.
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <h4 className="font-medium text-blue-900 mb-2">📸 Upload BOL Photo</h4>
                <p className="text-sm text-blue-700 mb-3">
                  Take a clear photo of your completed BOL document
                </p>
                <SimpleFileUpload
                  loadId={loadId!}
                  onUploadComplete={handleUploadComplete}
                />
              </div>
              
              <Button 
                variant="outline" 
                onClick={() => {
                  setReadyForUpload(false);
                  setLoadId(null);
                  form.reset({
                    loadNumber: "109-",
                    bolNumber: "374-",
                    tripNumber: "",
                  });
                }}
                className="w-full"
              >
                Cancel / Upload Different Load
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}