import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import StandaloneBOLUpload from "@/components/StandaloneBOLUpload";
import { SimpleFileUpload } from "@/components/SimpleFileUpload";
import { useDriverAuth } from "@/hooks/useDriverAuth";
import { apiRequest } from "@/lib/queryClient";

export default function DriverPortal() {
  console.log("🚨 EMERGENCY DEBUG: DriverPortal function called!");
  console.log("🚨 typeof window:", typeof window);
  console.log("🚨 window.location:", window?.location?.href);
  
  // SIMPLE TEST VERSION - Let's see if this renders
  return (
    <div className="max-w-lg mx-auto min-h-screen bg-gray-50 p-4">
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-xl font-bold text-green-600">✅ DRIVER PORTAL LOADED!</h1>
        <p className="mt-2">If you see this, the React component is working.</p>
        <p className="text-sm text-gray-600 mt-4">Component rendered successfully on mobile.</p>
        <div className="mt-4 p-3 bg-blue-50 rounded">
          <p className="text-sm">✓ Server authentication working</p>
          <p className="text-sm">✓ React component loading</p>
          <p className="text-sm">✓ Basic UI rendering</p>
        </div>
      </div>
    </div>
  );
}