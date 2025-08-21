import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

export default function LoadsTable() {
  const { toast } = useToast();

  const { data: loads, isLoading } = useQuery({
    queryKey: ["/api/loads"],
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <Card className="material-card">
        <CardHeader>
          <CardTitle>Active Loads</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Filter out completed loads for the main table
  const activeLoads = Array.isArray(loads) ? loads.filter((load: any) => load.status !== "completed") : [];

  return (
    <Card className="material-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Active Loads</CardTitle>
          <div className="flex space-x-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                toast({
                  title: "Filter Feature",
                  description: "Filter options will be implemented to sort loads by status, driver, or date.",
                });
              }}
            >
              <i className="fas fa-filter mr-2"></i>Filter
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                toast({
                  title: "Export Feature",
                  description: "Load data will be exported to CSV/Excel format for reporting.",
                });
              }}
            >
              <i className="fas fa-download mr-2"></i>Export
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {activeLoads.length === 0 ? (
          <div className="text-center py-8">
            <i className="fas fa-truck text-4xl text-gray-400 mb-4"></i>
            <p className="text-gray-600">No active loads found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>109 Number</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeLoads.map((load: any) => (
                  <TableRow key={load.id} className="hover:bg-gray-50">
                    <TableCell>
                      <div>
                        <div className="text-sm font-medium text-secondary">
                          {load.number109}
                        </div>
                        <div className="text-xs text-gray-500">
                          {new Date(load.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {load.driver ? (
                        <div className="flex items-center">
                          <img 
                            className="h-8 w-8 rounded-full mr-3" 
                            src={load.driver.profileImageUrl || `https://ui-avatars.io/api/?name=${load.driver.firstName}+${load.driver.lastName}&background=1976D2&color=fff`}
                            alt="Driver" 
                          />
                          <div>
                            <div className="text-sm font-medium text-secondary">
                              {load.driver.firstName} {load.driver.lastName}
                            </div>
                            <div className="text-xs text-gray-500">
                              ID: {load.driver.id.slice(0, 8)}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-500">No driver assigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {load.location ? (
                        <div>
                          <div className="text-sm text-secondary">{load.location.name}</div>
                          <div className="text-xs text-gray-500">
                            {load.estimatedMiles || 0} miles
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-500">No location</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(load.status)}>
                        {getStatusText(load.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        <Button variant="ghost" size="sm">
                          <i className="fas fa-eye text-primary"></i>
                        </Button>
                        <Button variant="ghost" size="sm">
                          <i className="fas fa-edit text-gray-400"></i>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
