import { Card, CardContent } from "@/components/ui/card";

interface StatsCardsProps {
  stats?: {
    activeLoads: number;
    inTransit: number;
    deliveredToday: number;
    revenueToday: string;
  };
  isLoading: boolean;
}

export default function StatsCards({ stats, isLoading }: StatsCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="material-card">
            <CardContent className="p-6">
              <div className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded mb-2"></div>
                <div className="h-8 bg-gray-200 rounded"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      <Card className="material-card">
        <CardContent className="p-6">
          <div className="flex items-center">
            <div className="flex-1">
              <h3 className="text-sm font-medium text-gray-500">Active Loads</h3>
              <p className="text-3xl font-bold text-secondary">
                {stats?.activeLoads || 0}
              </p>
            </div>
            <i className="fas fa-truck text-primary text-2xl"></i>
          </div>
        </CardContent>
      </Card>

      <Card className="material-card">
        <CardContent className="p-6">
          <div className="flex items-center">
            <div className="flex-1">
              <h3 className="text-sm font-medium text-gray-500">In Transit</h3>
              <p className="text-3xl font-bold text-warning">
                {stats?.inTransit || 0}
              </p>
            </div>
            <i className="fas fa-route text-warning text-2xl"></i>
          </div>
        </CardContent>
      </Card>

      <Card className="material-card">
        <CardContent className="p-6">
          <div className="flex items-center">
            <div className="flex-1">
              <h3 className="text-sm font-medium text-gray-500">Delivered Today</h3>
              <p className="text-3xl font-bold text-success">
                {stats?.deliveredToday || 0}
              </p>
            </div>
            <i className="fas fa-check-circle text-success text-2xl"></i>
          </div>
        </CardContent>
      </Card>

      <Card className="material-card">
        <CardContent className="p-6">
          <div className="flex items-center">
            <div className="flex-1">
              <h3 className="text-sm font-medium text-gray-500">Revenue Today</h3>
              <p className="text-3xl font-bold text-primary">
                {stats?.revenueToday || "$0"}
              </p>
            </div>
            <i className="fas fa-dollar-sign text-primary text-2xl"></i>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
