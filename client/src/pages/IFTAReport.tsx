import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Truck, MapPin, Fuel } from "lucide-react";

interface Load {
  id: number;
  number109: string;
  status: string;
  deliveredAt?: string;
  iftaTruckNumber?: string;
  milesByState?: Record<string, number>;
  deadheadMilesByState?: Record<string, number>;
  deadheadMiles?: string;
  startingOdometerReading?: string;
  endingOdometerReading?: string;
}

export default function IFTAReport() {
  const { data: loads, isLoading } = useQuery<Load[]>({
    queryKey: ["/api/loads"],
  });

  // Filter loads with IFTA data
  const iftaLoads = loads?.filter(load => 
    load.milesByState || load.deadheadMilesByState
  ) || [];

  // Calculate totals by state
  const stateTotals = iftaLoads.reduce((acc, load) => {
    // Add route miles
    if (load.milesByState) {
      Object.entries(load.milesByState).forEach(([state, miles]) => {
        if (!acc[state]) {
          acc[state] = { route: 0, deadhead: 0, total: 0 };
        }
        acc[state].route += miles;
        acc[state].total += miles;
      });
    }
    
    // Add deadhead miles
    if (load.deadheadMilesByState) {
      Object.entries(load.deadheadMilesByState).forEach(([state, miles]) => {
        if (!acc[state]) {
          acc[state] = { route: 0, deadhead: 0, total: 0 };
        }
        acc[state].deadhead += miles;
        acc[state].total += miles;
      });
    }
    
    return acc;
  }, {} as Record<string, { route: number; deadhead: number; total: number }>);

  const sortedStates = Object.keys(stateTotals).sort();

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Fuel className="h-8 w-8 text-blue-600" />
        <h1 className="text-3xl font-bold">IFTA Reporting</h1>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Loads Tracked
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{iftaLoads.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              States Traveled
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sortedStates.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Miles
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Object.values(stateTotals).reduce((sum, s) => sum + s.total, 0).toFixed(1)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* State Summary Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Mileage by State
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sortedStates.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>State</TableHead>
                  <TableHead className="text-right">Route Miles</TableHead>
                  <TableHead className="text-right">Deadhead Miles</TableHead>
                  <TableHead className="text-right">Total Miles</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedStates.map(state => (
                  <TableRow key={state}>
                    <TableCell className="font-medium">{state}</TableCell>
                    <TableCell className="text-right">
                      {stateTotals[state].route.toFixed(1)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={stateTotals[state].deadhead > 0 ? "default" : "outline"}>
                        {stateTotals[state].deadhead.toFixed(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {stateTotals[state].total.toFixed(1)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-bold">
                  <TableCell>TOTAL</TableCell>
                  <TableCell className="text-right">
                    {Object.values(stateTotals).reduce((sum, s) => sum + s.route, 0).toFixed(1)}
                  </TableCell>
                  <TableCell className="text-right">
                    {Object.values(stateTotals).reduce((sum, s) => sum + s.deadhead, 0).toFixed(1)}
                  </TableCell>
                  <TableCell className="text-right">
                    {Object.values(stateTotals).reduce((sum, s) => sum + s.total, 0).toFixed(1)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-center py-8">
              No IFTA data available yet. Complete loads with GPS tracking enabled to see data here.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Individual Load Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Load Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          {iftaLoads.length > 0 ? (
            <div className="space-y-4">
              {iftaLoads.map(load => (
                <Card key={load.id} className="border-l-4 border-l-blue-500">
                  <CardContent className="pt-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-semibold text-lg">Load #{load.number109}</h3>
                        {load.iftaTruckNumber && (
                          <p className="text-sm text-muted-foreground">
                            Truck: {load.iftaTruckNumber}
                          </p>
                        )}
                        {load.deliveredAt && (
                          <p className="text-sm text-muted-foreground">
                            Delivered: {format(new Date(load.deliveredAt), "MMM d, yyyy")}
                          </p>
                        )}
                      </div>
                      <Badge variant="outline">{load.status}</Badge>
                    </div>

                    {load.deadheadMiles && (
                      <div className="mb-3 p-3 bg-amber-50 dark:bg-amber-950 rounded-lg">
                        <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                          🚛 Deadhead Miles: {load.deadheadMiles}
                        </p>
                      </div>
                    )}

                    <div className="grid gap-3 sm:grid-cols-2">
                      {/* Route Miles */}
                      {load.milesByState && Object.keys(load.milesByState).length > 0 && (
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-muted-foreground">Route Miles by State:</p>
                          {Object.entries(load.milesByState).map(([state, miles]) => (
                            <div key={state} className="flex justify-between text-sm">
                              <span>{state}</span>
                              <span className="font-medium">{miles.toFixed(1)} mi</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Deadhead Miles */}
                      {load.deadheadMilesByState && Object.keys(load.deadheadMilesByState).length > 0 && (
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-muted-foreground">Deadhead Miles by State:</p>
                          {Object.entries(load.deadheadMilesByState).map(([state, miles]) => (
                            <div key={state} className="flex justify-between text-sm">
                              <span>{state}</span>
                              <span className="font-medium text-amber-600">{miles.toFixed(1)} mi</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">
              No loads with IFTA tracking data yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
