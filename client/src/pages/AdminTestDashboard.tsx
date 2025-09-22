import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function AdminTestDashboard() {
  const { user, isAuthenticated, isLoading } = useAdminAuth();
  const [, setLocation] = useLocation();

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/admin-logout", {
        method: "POST",
        credentials: "include"
      });
      setLocation("/");
    } catch (error) {
      setLocation("/");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Not Authenticated</h1>
          <Button onClick={() => setLocation("/")}>Go to Login</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-blue-600">LoadTracker Pro - Test Dashboard</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm font-medium text-gray-700">
                Welcome, {user?.firstName} {user?.lastName} (admin)
              </span>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Authentication Success!</h2>
          
          <div className="bg-green-50 border border-green-200 rounded-md p-4 mb-6">
            <div className="flex">
              <div className="ml-3">
                <h3 className="text-sm font-medium text-green-800">
                  Admin Authentication Working ✓
                </h3>
                <div className="mt-2 text-sm text-green-700">
                  <p>Successfully authenticated as admin user</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-medium text-gray-900 mb-2">User Details</h3>
              <dl className="text-sm space-y-1">
                <div><dt className="inline font-medium">ID:</dt> <dd className="inline">{user?.id}</dd></div>
                <div><dt className="inline font-medium">Username:</dt> <dd className="inline">{user?.username}</dd></div>
                <div><dt className="inline font-medium">Role:</dt> <dd className="inline">{user?.role}</dd></div>
                <div><dt className="inline font-medium">Auth Type:</dt> <dd className="inline">admin</dd></div>
              </dl>
            </div>
            
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-medium text-gray-900 mb-2">Session Status</h3>
              <dl className="text-sm space-y-1">
                <div><dt className="inline font-medium">Authenticated:</dt> <dd className="inline">{isAuthenticated ? 'Yes' : 'No'}</dd></div>
                <div><dt className="inline font-medium">Loading:</dt> <dd className="inline">{isLoading ? 'Yes' : 'No'}</dd></div>
                <div><dt className="inline font-medium">Login Time:</dt> <dd className="inline">{new Date().toLocaleTimeString()}</dd></div>
              </dl>
            </div>
          </div>

          <div className="mt-6">
            <Button 
              onClick={() => setLocation("/dashboard")} 
              className="mr-4"
            >
              Go to Full Dashboard
            </Button>
            <Button variant="outline" onClick={handleLogout}>
              Logout
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}