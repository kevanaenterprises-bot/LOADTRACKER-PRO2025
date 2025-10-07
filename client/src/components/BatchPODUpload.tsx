import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { X, Upload, FileImage, FileText, TruckIcon, Fuel } from "lucide-react";

interface BatchPODUploadProps {
  loadId: string;
  loadNumber: string;
  onUploadComplete: () => void;
}

interface UploadedFile {
  file: File;
  url?: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  id: string;
}

export function BatchPODUpload({ loadId, loadNumber, onUploadComplete }: BatchPODUploadProps) {
  const { toast } = useToast();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  
  // IFTA reporting fields
  const [iftaTruckNumber, setIftaTruckNumber] = useState('');
  const [iftaMiles, setIftaMiles] = useState('');
  const [fuelGallons, setFuelGallons] = useState('');
  const [fuelAmount, setFuelAmount] = useState('');

  const processFiles = (fileList: FileList | File[]) => {
    const selectedFiles = Array.from(fileList);
    
    if (selectedFiles.length === 0) return;
    
    // Validate file types (images and PDFs)
    const validFiles = selectedFiles.filter(file => {
      const isValid = file.type.startsWith('image/') || file.type === 'application/pdf';
      if (!isValid) {
        toast({
          title: "Invalid File Type",
          description: `${file.name} is not a valid image or PDF file`,
          variant: "destructive",
        });
      }
      return isValid;
    });

    // Create upload file objects
    const newFiles: UploadedFile[] = validFiles.map(file => ({
      file,
      status: 'pending',
      progress: 0,
      id: `${file.name}-${Date.now()}-${Math.random()}`
    }));

    setFiles(prev => [...prev, ...newFiles]);
    
    toast({
      title: "Files Added",
      description: `${validFiles.length} file(s) ready for upload`,
    });
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      processFiles(event.target.files);
    }
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0) {
      processFiles(droppedFiles);
    }
  };

  const removeFile = (fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const uploadFile = async (fileItem: UploadedFile): Promise<string> => {
    try {
      // Update file status
      setFiles(prev => prev.map(f => 
        f.id === fileItem.id ? { ...f, status: 'uploading', progress: 10 } : f
      ));

      // Create FormData for direct upload
      const formData = new FormData();
      formData.append('file', fileItem.file);

      // Update progress
      setFiles(prev => prev.map(f => 
        f.id === fileItem.id ? { ...f, progress: 30 } : f
      ));

      // Direct upload to server (bypasses CORS)
      const uploadResponse = await fetch("/api/objects/direct-upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json().catch(() => ({ message: "Upload failed" }));
        throw new Error(errorData.message || `Upload failed: ${uploadResponse.status}`);
      }

      const { publicPath } = await uploadResponse.json();

      // Update progress
      setFiles(prev => prev.map(f => 
        f.id === fileItem.id ? { ...f, progress: 100, url: publicPath } : f
      ));

      return publicPath;
    } catch (error) {
      setFiles(prev => prev.map(f => 
        f.id === fileItem.id ? { ...f, status: 'error', progress: 0 } : f
      ));
      throw error;
    }
  };

  const uploadAllFiles = async () => {
    if (files.length === 0) {
      toast({
        title: "No Files Selected",
        description: "Please select POD files to upload",
        variant: "destructive",
      });
      return;
    }

    // Validate required IFTA fields
    if (!iftaTruckNumber.trim()) {
      toast({
        title: "Truck # Required",
        description: "Please enter the truck number for IFTA reporting",
        variant: "destructive",
      });
      return;
    }

    if (!iftaMiles.trim() || parseFloat(iftaMiles) <= 0) {
      toast({
        title: "Total Miles Required",
        description: "Please enter the total miles (including deadhead) for IFTA reporting",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const uploadPromises = files.map(uploadFile);
      const uploadedUrls = await Promise.all(uploadPromises);
      
      // Update all files as successful
      setFiles(prev => prev.map(f => ({ ...f, status: 'success', progress: 100 })));
      setUploadProgress(60);

      // Update load with all POD documents (combine URLs) AND IFTA data
      const podDocumentPath = uploadedUrls.join(','); // Store as comma-separated URLs
      
      const updateResponse = await fetch(`/api/loads/${loadId}/pod`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          podDocumentURL: podDocumentPath,
          iftaTruckNumber: iftaTruckNumber.trim(),
          iftaMiles: parseFloat(iftaMiles),
          fuelGallons: fuelGallons.trim() ? parseFloat(fuelGallons) : null,
          fuelAmount: fuelAmount.trim() ? parseFloat(fuelAmount) : null,
        }),
      });

      if (!updateResponse.ok) {
        throw new Error(`Failed to update load: ${updateResponse.status}`);
      }

      setUploadProgress(100);
      
      toast({
        title: "Upload Successful!",
        description: `${files.length} POD document(s) and IFTA data saved for load ${loadNumber}`,
      });

      // Auto-invoke generation and refresh
      setTimeout(() => {
        onUploadComplete();
      }, 1000);

    } catch (error) {
      console.error("Batch upload error:", error);
      toast({
        title: "Upload Failed",
        description: `Error uploading POD documents: ${error instanceof Error ? error.message : "Unknown error"}`,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) {
      return <FileImage className="h-4 w-4" />;
    } else if (file.type === 'application/pdf') {
      return <FileText className="h-4 w-4" />;
    }
    return <FileText className="h-4 w-4" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Batch POD Upload - Load {loadNumber}
        </CardTitle>
        <p className="text-sm text-gray-600">
          Upload multiple pages/documents for this POD. Supports images and PDF files.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* File Selection with Drag and Drop */}
        <div 
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-all ${
            isDragging 
              ? 'border-blue-500 bg-blue-50 scale-105' 
              : 'border-gray-300 hover:border-gray-400'
          }`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <Upload className={`h-8 w-8 mx-auto mb-2 ${isDragging ? 'text-blue-500' : 'text-gray-400'}`} />
          <label htmlFor="pod-files" className="cursor-pointer">
            <span className="text-sm font-medium text-blue-600 hover:text-blue-500">
              {isDragging ? 'Drop files here' : 'Click to select POD files'}
            </span>
            <span className="text-sm text-gray-500 block">or drag and drop</span>
            <span className="text-xs text-gray-400 block mt-1">
              Images (JPG, PNG, HEIC, etc.) and PDF files only
            </span>
          </label>
          <Input
            id="pod-files"
            type="file"
            multiple
            accept="image/*,.pdf,.heic,.heif"
            onChange={handleFileSelect}
            className="hidden"
            disabled={isUploading}
          />
        </div>

        {/* File List */}
        {files.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium">Selected Files ({files.length})</h4>
            {files.map((fileItem) => (
              <div key={fileItem.id} className="flex items-center gap-3 p-3 border rounded-lg">
                <div className="flex-shrink-0">
                  {getFileIcon(fileItem.file)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {fileItem.file.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(fileItem.file.size)}
                  </p>
                  {fileItem.status === 'uploading' && fileItem.progress > 0 && (
                    <Progress value={fileItem.progress} className="h-1 mt-1" />
                  )}
                </div>
                <div className="flex-shrink-0 flex items-center gap-2">
                  <Badge variant={
                    fileItem.status === 'success' ? 'default' :
                    fileItem.status === 'error' ? 'destructive' :
                    fileItem.status === 'uploading' ? 'secondary' : 'outline'
                  }>
                    {fileItem.status === 'success' ? '✓' :
                     fileItem.status === 'error' ? '✗' :
                     fileItem.status === 'uploading' ? '⏳' : '⏸'}
                  </Badge>
                  {!isUploading && fileItem.status !== 'success' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFile(fileItem.id)}
                      className="h-6 w-6 p-0"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* IFTA Reporting Data */}
        {files.length > 0 && (
          <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TruckIcon className="h-4 w-4" />
                IFTA Reporting Data (Required)
              </CardTitle>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Enter trip details for fuel tax reporting. Truck # and Total Miles are mandatory.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Truck Number - MANDATORY */}
                <div className="space-y-2">
                  <Label htmlFor="iftaTruckNumber" className="text-sm font-medium">
                    Truck # <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="iftaTruckNumber"
                    data-testid="input-ifta-truck-number"
                    type="text"
                    placeholder="e.g., 109, T-42"
                    value={iftaTruckNumber}
                    onChange={(e) => setIftaTruckNumber(e.target.value)}
                    disabled={isUploading}
                    required
                  />
                </div>

                {/* Total Miles - MANDATORY */}
                <div className="space-y-2">
                  <Label htmlFor="iftaMiles" className="text-sm font-medium">
                    Total Miles <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="iftaMiles"
                    data-testid="input-ifta-miles"
                    type="number"
                    step="0.01"
                    placeholder="Include deadhead miles"
                    value={iftaMiles}
                    onChange={(e) => setIftaMiles(e.target.value)}
                    disabled={isUploading}
                    required
                  />
                  <p className="text-xs text-gray-500">
                    Total miles for complete trip (loaded + deadhead)
                  </p>
                </div>

                {/* Fuel Gallons - OPTIONAL */}
                <div className="space-y-2">
                  <Label htmlFor="fuelGallons" className="text-sm font-medium flex items-center gap-1">
                    <Fuel className="h-3 w-3" />
                    Fuel Gallons (Optional)
                  </Label>
                  <Input
                    id="fuelGallons"
                    data-testid="input-fuel-gallons"
                    type="number"
                    step="0.01"
                    placeholder="e.g., 125.5"
                    value={fuelGallons}
                    onChange={(e) => setFuelGallons(e.target.value)}
                    disabled={isUploading}
                  />
                </div>

                {/* Fuel Amount - OPTIONAL */}
                <div className="space-y-2">
                  <Label htmlFor="fuelAmount" className="text-sm font-medium">
                    Fuel Amount $ (Optional)
                  </Label>
                  <Input
                    id="fuelAmount"
                    data-testid="input-fuel-amount"
                    type="number"
                    step="0.01"
                    placeholder="e.g., 450.25"
                    value={fuelAmount}
                    onChange={(e) => setFuelAmount(e.target.value)}
                    disabled={isUploading}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Upload Progress */}
        {isUploading && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Uploading POD documents...</span>
              <span>{uploadProgress}%</span>
            </div>
            <Progress value={uploadProgress} />
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-4 border-t">
          <Button 
            onClick={uploadAllFiles}
            disabled={files.length === 0 || isUploading}
            className="flex-1"
            data-testid="button-upload-pod-with-ifta"
          >
            {isUploading ? 'Uploading...' : `Upload ${files.length} POD Document(s) + IFTA Data`}
          </Button>
          {files.length > 0 && !isUploading && (
            <Button 
              variant="outline" 
              onClick={() => setFiles([])}
              className="px-6"
              data-testid="button-clear-files"
            >
              Clear All
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}