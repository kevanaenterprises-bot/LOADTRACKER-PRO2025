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
      </div>
    </div>
  );
}
