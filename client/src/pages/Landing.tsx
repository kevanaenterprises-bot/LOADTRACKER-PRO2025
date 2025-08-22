import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import logoUrl from "@assets/generated_images/Go_Farms_Cattle_Texas_Logo_8f26a064.png";

export default function Landing() {
  const [, setLocation] = useLocation();

  const handleAdminLogin = () => {
    setLocation("/admin-login");
  };

  const handleDriverLogin = () => {
    setLocation("/driver-login");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col items-center justify-center px-4">
      {/* Company Logo */}
      <div className="mb-12 text-center">
        <img 
          src={logoUrl} 
          alt="Go Farms & Cattle Logo" 
          className="w-48 h-48 mx-auto mb-6 object-contain"
        />
        <h1 className="text-4xl font-bold text-primary">LoadTracker Pro</h1>
      </div>

      {/* Login Buttons */}
      <div className="flex flex-col gap-6 w-full max-w-md">
        <Button 
          onClick={handleAdminLogin} 
          size="lg" 
          className="w-full py-4 text-lg font-semibold"
        >
          <i className="fas fa-user-shield mr-3 text-xl"></i>
          Admin Login
        </Button>
        
        <Button 
          onClick={handleDriverLogin} 
          variant="outline" 
          size="lg" 
          className="w-full py-4 text-lg font-semibold"
        >
          <i className="fas fa-truck mr-3 text-xl"></i>
          Driver Login
        </Button>
        
        <div className="mt-6 pt-6 border-t border-gray-200 space-y-3">
          <Button 
            onClick={() => setLocation("/troubleshoot")} 
            variant="outline" 
            size="sm" 
            className="w-full bg-red-50 border-red-200 text-red-700 hover:bg-red-100"
          >
            <i className="fas fa-wrench mr-2"></i>
            Fix Problems
          </Button>
          <Button 
            onClick={() => setLocation("/how-to-assign")} 
            variant="outline" 
            size="sm" 
            className="w-full bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
          >
            <i className="fas fa-book mr-2"></i>
            How to Assign Drivers
          </Button>

        </div>
      </div>
    </div>
  );
}
