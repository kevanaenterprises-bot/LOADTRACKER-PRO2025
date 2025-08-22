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
  loadNumber: z.string().min(1, "109 number is required"),
  bolNumber: z.string().min(1, "374 number is required"), 
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
      loadNumber: "109-",
      bolNumber: "374-",
      tripNumber: "",
    },
  });

  const findLoadMutation = useMutation({
    mutationFn: async (data: BOLUploadData) => {
      // Check if 374 number already exists
      const bolCheckResponse = await apiRequest(`/api/bol/check/${data.bolNumber}`, "GET");
      
      if (bolCheckResponse?.exists) {
        throw new Error(`BOL number ${data.bolNumber} has already been used`);
      }

      // First, find the load by 109 number
      const loadResponse = await apiRequest(`/api/loads/by-number/${data.loadNumber}`, "GET");
      
      if (!loadResponse) {
        throw new Error(`Load ${data.loadNumber} not found`);
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
                Enter your load details to upload a BOL photo:
              </p>
              
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="loadNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>109 Number</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="109-36205" 
                            {...field}
                            className="text-sm"
                            onChange={(e) => {
                              let value = e.target.value;
                              if (!value.startsWith("109-")) {
                                value = "109-" + value.replace("109-", "");
                              }
                              field.onChange(value);
                            }}
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
                        <FormLabel>374 Number</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="374-22222" 
                            {...field}
                            className="text-sm"
                            onChange={(e) => {
                              let value = e.target.value;
                              if (!value.startsWith("374-")) {
                                value = "374-" + value.replace("374-", "");
                              }
                              field.onChange(value);
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
                    className="w-full"
                    disabled={findLoadMutation.isPending}
                  >
                    {findLoadMutation.isPending ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Finding Load...
                      </>
                    ) : (
                      "Find Load & Prepare Upload"
                    )}
                  </Button>
                </form>
              </Form>
            </>
          ) : (
            <>
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm font-medium text-green-800">
                  Load Ready for BOL Upload
                </p>
                <p className="text-xs text-green-600">
                  Upload your BOL photo below:
                </p>
              </div>
              
              <SimpleFileUpload
                loadId={loadId!}
                onUploadComplete={handleUploadComplete}
              />
              
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