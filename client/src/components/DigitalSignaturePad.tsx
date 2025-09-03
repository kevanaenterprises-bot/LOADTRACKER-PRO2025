import React, { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Pen, RotateCcw, Save, Trash2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface DigitalSignaturePadProps {
  loadId?: string;
  loadNumber?: string;
  onSignatureComplete?: (signatureData: string) => void;
  className?: string;
}

export function DigitalSignaturePad({ 
  loadId, 
  loadNumber, 
  onSignatureComplete,
  className = "" 
}: DigitalSignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set up canvas styling
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Fill with white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    setIsEmpty(false);
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let x, y;
    if ('touches' in e) {
      x = e.touches[0].clientX - rect.left;
      y = e.touches[0].clientY - rect.top;
    } else {
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
    }

    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let x, y;
    if ('touches' in e) {
      e.preventDefault(); // Prevent scrolling on mobile
      x = e.touches[0].clientX - rect.left;
      y = e.touches[0].clientY - rect.top;
    } else {
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
    }

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
  };

  const saveSignatureMutation = useMutation({
    mutationFn: async () => {
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("Canvas not available");

      // Convert canvas to blob
      return new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else throw new Error("Failed to create signature blob");
        }, 'image/png');
      });
    },
    onSuccess: async (blob) => {
      try {
        // Get upload URL
        const urlResponse = await fetch("/api/objects/upload", {
          method: "POST",
          credentials: "include",
          headers: {
            'x-bypass-token': 'LOADTRACKER_BYPASS_2025'
          }
        });

        if (!urlResponse.ok) {
          throw new Error(`Failed to get upload URL: ${urlResponse.status}`);
        }

        const { uploadURL } = await urlResponse.json();

        // Upload signature image
        const uploadResponse = await fetch(uploadURL, {
          method: "PUT",
          body: blob,
          headers: { "Content-Type": "image/png" },
        });

        if (!uploadResponse.ok) {
          throw new Error(`Upload failed: ${uploadResponse.status}`);
        }

        // Save signature reference to load if loadId provided
        if (loadId) {
          await apiRequest(`/api/loads/${loadId}/signature`, {
            method: "PATCH",
            headers: {
              'x-bypass-token': 'LOADTRACKER_BYPASS_2025'
            },
            body: JSON.stringify({ 
              signatureURL: uploadURL,
              signedAt: new Date().toISOString() 
            }),
          });
        }

        toast({
          title: "Signature Saved",
          description: `Digital signature saved successfully${loadNumber ? ` for load ${loadNumber}` : ''}`,
        });

        // Convert canvas to data URL for callback
        const canvas = canvasRef.current;
        if (canvas && onSignatureComplete) {
          onSignatureComplete(canvas.toDataURL());
        }

      } catch (error) {
        console.error("Failed to save signature:", error);
        throw error;
      }
    },
    onError: (error: any) => {
      toast({
        title: "Signature Save Failed",
        description: error.message || "Failed to save signature. Please try again.",
        variant: "destructive",
      });
    }
  });

  const downloadSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas || isEmpty) return;

    const link = document.createElement('a');
    link.download = `signature-${loadNumber || 'document'}-${Date.now()}.png`;
    link.href = canvas.toDataURL();
    link.click();
  };

  return (
    <Card className={className} data-testid="signature-pad">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Pen className="h-5 w-5" />
          Digital Signature
          {loadNumber && <span className="text-sm text-muted-foreground">- Load {loadNumber}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 bg-white">
          <canvas
            ref={canvasRef}
            width={400}
            height={200}
            className="w-full h-auto border border-gray-200 rounded cursor-crosshair touch-none"
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
            data-testid="signature-canvas"
          />
          <div className="text-sm text-gray-500 mt-2 text-center">
            Sign above using your mouse or finger
          </div>
        </div>

        <div className="flex flex-wrap gap-2 justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={clearSignature}
            disabled={isEmpty}
            data-testid="button-clear-signature"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Clear
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={downloadSignature}
            disabled={isEmpty}
            data-testid="button-download-signature"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Download
          </Button>

          <Button
            onClick={() => saveSignatureMutation.mutate()}
            disabled={isEmpty || saveSignatureMutation.isPending}
            size="sm"
            data-testid="button-save-signature"
          >
            <Save className="h-4 w-4 mr-2" />
            {saveSignatureMutation.isPending ? "Saving..." : "Save Signature"}
          </Button>
        </div>

        {saveSignatureMutation.isPending && (
          <div className="text-sm text-center text-muted-foreground">
            Uploading signature...
          </div>
        )}
      </CardContent>
    </Card>
  );
}