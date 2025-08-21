import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, Loader2, CheckCircle, AlertCircle } from "lucide-react";

interface ExtractedData {
  loadNumber?: string;
  poNumber?: string;
  appointmentTime?: string;
  companyName?: string;
  pickupAddress?: string;
  deliveryAddress?: string;
  confidence: number;
  rawText?: string;
}

export function OCRUploader() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const extractDataMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('image', file);
      
      const response = await fetch('/api/ocr/extract', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.json();
    },
    onSuccess: (data) => {
      setExtractedData(data);
      toast({
        title: "Data Extracted",
        description: `Found data with ${Math.round(data.confidence * 100)}% confidence`,
      });
    },
    onError: (error) => {
      console.error("OCR extraction failed:", error);
      toast({
        title: "Extraction Failed",
        description: "Could not read the image. Please try a clearer image.",
        variant: "destructive",
      });
    },
  });

  const generateLoadMutation = useMutation({
    mutationFn: async (extractedData: ExtractedData) => {
      return await apiRequest('/api/ocr/generate-load', 'POST', extractedData);
    },
    onSuccess: (data) => {
      toast({
        title: "Load Created",
        description: `Load ${data.number109} created successfully`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/loads'] });
      // Reset the form
      setSelectedFile(null);
      setExtractedData(null);
    },
    onError: (error) => {
      console.error("Load generation failed:", error);
      toast({
        title: "Load Creation Failed",
        description: "Could not create load from extracted data",
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (file: File) => {
    if (file && file.type.startsWith('image/')) {
      setSelectedFile(file);
      setExtractedData(null);
    } else {
      toast({
        title: "Invalid File",
        description: "Please select an image file (JPG, PNG, etc.)",
        variant: "destructive",
      });
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return "bg-green-100 text-green-800";
    if (confidence >= 0.6) return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Wright Con OCR Scanner
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        
        {/* Upload Area */}
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            dragOver 
              ? "border-primary bg-primary/5" 
              : "border-gray-300 hover:border-gray-400"
          }`}
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
        >
          <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <div className="space-y-2">
            <p className="text-lg font-medium">Upload Wright Con Image</p>
            <p className="text-sm text-gray-500">
              Drag and drop or click to select a rate confirmation image
            </p>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileInput}
              className="hidden"
              id="ocr-file-input"
            />
            <Button 
              variant="outline" 
              onClick={() => document.getElementById('ocr-file-input')?.click()}
            >
              Choose File
            </Button>
          </div>
        </div>

        {/* Selected File */}
        {selectedFile && (
          <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium">{selectedFile.name}</span>
              <span className="text-xs text-gray-500">
                ({(selectedFile.size / 1024 / 1024).toFixed(1)} MB)
              </span>
            </div>
            <Button
              onClick={() => extractDataMutation.mutate(selectedFile)}
              disabled={extractDataMutation.isPending}
              size="sm"
            >
              {extractDataMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Reading...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-2" />
                  Extract Data
                </>
              )}
            </Button>
          </div>
        )}

        {/* Extracted Data */}
        {extractedData && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Extracted Data</h3>
              <Badge className={getConfidenceColor(extractedData.confidence)}>
                {Math.round(extractedData.confidence * 100)}% Confidence
              </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {extractedData.loadNumber && (
                <div className="p-3 bg-gray-50 rounded">
                  <div className="text-sm text-gray-600">Load Number</div>
                  <div className="font-medium">{extractedData.loadNumber}</div>
                </div>
              )}
              
              {extractedData.poNumber && (
                <div className="p-3 bg-gray-50 rounded">
                  <div className="text-sm text-gray-600">PO Number</div>
                  <div className="font-medium">{extractedData.poNumber}</div>
                </div>
              )}
              
              {extractedData.appointmentTime && (
                <div className="p-3 bg-gray-50 rounded">
                  <div className="text-sm text-gray-600">Appointment Time</div>
                  <div className="font-medium">{extractedData.appointmentTime}</div>
                </div>
              )}
              
              {extractedData.companyName && (
                <div className="p-3 bg-gray-50 rounded">
                  <div className="text-sm text-gray-600">Company</div>
                  <div className="font-medium">{extractedData.companyName}</div>
                </div>
              )}
              
              {extractedData.pickupAddress && (
                <div className="p-3 bg-gray-50 rounded md:col-span-2">
                  <div className="text-sm text-gray-600">Pickup Address</div>
                  <div className="font-medium">{extractedData.pickupAddress}</div>
                </div>
              )}
              
              {extractedData.deliveryAddress && (
                <div className="p-3 bg-gray-50 rounded md:col-span-2">
                  <div className="text-sm text-gray-600">Delivery Address</div>
                  <div className="font-medium">{extractedData.deliveryAddress}</div>
                </div>
              )}
            </div>

            {extractedData.confidence < 0.6 && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Low confidence extraction. Please verify the data before creating a load.
                </AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2 pt-4">
              <Button
                onClick={() => generateLoadMutation.mutate(extractedData)}
                disabled={generateLoadMutation.isPending}
                className="flex-1"
              >
                {generateLoadMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Creating Load...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Create Load
                  </>
                )}
              </Button>
              
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedFile(null);
                  setExtractedData(null);
                }}
              >
                Clear
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}