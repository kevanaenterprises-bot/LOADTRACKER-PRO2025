import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function TestLoadClicks() {
  const [selectedLoad, setSelectedLoad] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Use driver auth which we know works
  const { data: loads, isLoading, error } = useQuery({
    queryKey: ["/api/loads"],
    retry: false,
    refetchOnWindowFocus: false,
  });

  const handleLoadClick = (load: any) => {
    console.log("Load clicked in test page:", load);
    setSelectedLoad(load);
    setDialogOpen(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "created":
        return "bg-gray-100 text-gray-800";
      case "en_route_pickup":
      case "en_route_receiver":
        return "bg-warning bg-opacity-20 text-warning";
      case "at_shipper":
      case "at_receiver":
        return "bg-blue-100 text-blue-800";
      case "delivered":
        return "bg-success bg-opacity-20 text-success";
      case "completed":
        return "bg-green-100 text-green-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "created":
        return "Created";
      case "en_route_pickup":
        return "En Route to Pickup";
      case "at_shipper":
        return "At Shipper";
      case "left_shipper":
        return "Left Shipper";
      case "en_route_receiver":
        return "En Route to Receiver";
      case "at_receiver":
        return "At Receiver";
      case "delivered":
        return "Delivered";
      case "completed":
        return "Completed";
      default:
        return status;
    }
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="text-red-600">Error: {(error as any).message}</div>
      </div>
    );
  }

  const activeLoads = Array.isArray(loads) ? loads.filter((load: any) => load.status !== "completed") : [];

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Test Load Clicks</h1>
        <div className="text-sm text-gray-600">
          Total loads: {Array.isArray(loads) ? loads.length : 0} | Active: {activeLoads.length}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active Loads Test</CardTitle>
        </CardHeader>
        <CardContent>
          {activeLoads.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-600">No active loads found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {activeLoads.map((load: any) => (
                <div
                  key={load.id}
                  className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => handleLoadClick(load)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-lg">{load.number109}</div>
                      <div className="text-sm text-gray-600">
                        Driver: {load.driver ? `${load.driver.firstName} ${load.driver.lastName}` : 'Not assigned'}
                      </div>
                      <div className="text-xs text-gray-500">
                        Created: {new Date(load.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge className={getStatusColor(load.status)}>
                        {getStatusText(load.status)}
                      </Badge>
                      <Button size="sm" onClick={(e) => {
                        e.stopPropagation();
                        handleLoadClick(load);
                      }}>
                        View Details
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Load Details Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Load Details - {selectedLoad?.number109}</DialogTitle>
          </DialogHeader>
          
          {selectedLoad && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold mb-2">Load Information</h4>
                  <div className="space-y-1 text-sm">
                    <div><strong>109 Number:</strong> {selectedLoad.number109}</div>
                    <div><strong>Status:</strong> <Badge className={getStatusColor(selectedLoad.status)}>{getStatusText(selectedLoad.status)}</Badge></div>
                    <div><strong>Created:</strong> {new Date(selectedLoad.createdAt).toLocaleDateString()}</div>
                    {selectedLoad.bolNumber && <div><strong>BOL Number:</strong> {selectedLoad.bolNumber}</div>}
                    {selectedLoad.tripNumber && <div><strong>Trip Number:</strong> {selectedLoad.tripNumber}</div>}
                  </div>
                </div>
                
                <div>
                  <h4 className="font-semibold mb-2">Driver & Destination</h4>
                  <div className="space-y-1 text-sm">
                    {selectedLoad.driver ? (
                      <div><strong>Driver:</strong> {selectedLoad.driver.firstName} {selectedLoad.driver.lastName}</div>
                    ) : (
                      <div><strong>Driver:</strong> <span className="text-gray-500">Not assigned</span></div>
                    )}
                    {selectedLoad.location && (
                      <div><strong>Destination:</strong> {selectedLoad.location.name}</div>
                    )}
                    {selectedLoad.estimatedMiles && (
                      <div><strong>Miles:</strong> {selectedLoad.estimatedMiles}</div>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2">Documents Status</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${selectedLoad.bolDocumentPath ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                    <span>BOL Document {selectedLoad.bolDocumentPath ? '✅' : '❌'}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${selectedLoad.podDocumentPath ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                    <span>POD Document {selectedLoad.podDocumentPath ? '✅' : '❌'}</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}