import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function CacheDebugger() {
  const queryClient = useQueryClient();
  const [logs, setLogs] = useState<string[]>([]);
  const [isVisible, setIsVisible] = useState(false);

  // Monitor loads query
  const { data: loads, dataUpdatedAt: loadsUpdatedAt } = useQuery({
    queryKey: ["/api/loads"],
    staleTime: 0,
  });

  // Monitor driver loads query
  const { data: driverLoads, dataUpdatedAt: driverLoadsUpdatedAt } = useQuery({
    queryKey: ["/api/drivers/605889a6-d87b-46c4-880a-7e058ad87802/loads"],
    staleTime: 0,
  });

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [`${timestamp}: ${message}`, ...prev.slice(0, 9)]);
  };

  useEffect(() => {
    addLog(`Loads data updated - ${Array.isArray(loads) ? loads.length : 0} loads`);
  }, [loadsUpdatedAt]);

  useEffect(() => {
    addLog(`Driver loads updated - ${Array.isArray(driverLoads) ? driverLoads.length : 0} loads`);
  }, [driverLoadsUpdatedAt]);

  const forceRefresh = () => {
    addLog("🔄 Force refresh triggered");
    queryClient.invalidateQueries({ queryKey: ["/api/loads"] });
    queryClient.invalidateQueries({ queryKey: ["/api/drivers/605889a6-d87b-46c4-880a-7e058ad87802/loads"] });
  };

  const clearCache = () => {
    addLog("🗑️ Cache cleared");
    queryClient.clear();
  };

  const getCurrentLoadData = () => {
    if (!Array.isArray(loads)) return null;
    const load = loads.find((l: any) => l.id === "11a30baf-5b16-485c-8b93-167942da9311");
    return load;
  };

  if (!isVisible) {
    return (
      <Button 
        onClick={() => setIsVisible(true)} 
        variant="outline" 
        size="sm"
        className="fixed bottom-4 right-4 z-50"
      >
        🐛 Debug
      </Button>
    );
  }

  const currentLoad = getCurrentLoadData();

  return (
    <Card className="fixed bottom-4 right-4 w-96 max-h-96 overflow-hidden z-50 shadow-lg">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <CardTitle className="text-sm">Cache Debugger</CardTitle>
          <Button 
            onClick={() => setIsVisible(false)} 
            variant="ghost" 
            size="sm"
          >
            ✕
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Current Load Status */}
        <div className="space-y-1">
          <div className="text-xs font-medium">Load 109-38669 Status:</div>
          <div className="text-xs">
            Driver: {currentLoad?.driver ? 
              `${currentLoad.driver.firstName} ${currentLoad.driver.lastName}` : 
              "Not assigned"
            }
          </div>
          <div className="text-xs">
            Last Updated: {currentLoad?.updatedAt ? 
              new Date(currentLoad.updatedAt).toLocaleTimeString() : 
              "Unknown"
            }
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-2">
          <Button onClick={forceRefresh} size="sm" variant="outline">
            🔄 Refresh
          </Button>
          <Button onClick={clearCache} size="sm" variant="outline">
            🗑️ Clear
          </Button>
        </div>

        {/* Data Counts */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <Badge variant="secondary">
              Loads: {Array.isArray(loads) ? loads.length : 0}
            </Badge>
          </div>
          <div>
            <Badge variant="secondary">
              Driver Loads: {Array.isArray(driverLoads) ? driverLoads.length : 0}
            </Badge>
          </div>
        </div>

        {/* Activity Log */}
        <div className="space-y-1">
          <div className="text-xs font-medium">Activity Log:</div>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {logs.map((log, index) => (
              <div key={index} className="text-xs text-gray-600 font-mono">
                {log}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}