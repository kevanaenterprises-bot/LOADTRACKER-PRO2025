import logoImage from "@assets/generated_images/Go_Farms_Cattle_Texas_Logo_8f26a064.png";

interface HeaderProps {
  title?: string;
  showLogo?: boolean;
}

export function Header({ title = "LoadTracker Pro", showLogo = true }: HeaderProps) {
  return (
    <header className="bg-white shadow-md border-b border-gray-200 px-6 py-4 sticky top-0 z-50">
      <div className="flex items-center gap-4">
        {showLogo && (
          <img 
            src={logoImage} 
            alt="Go Farms & Cattle" 
            className="h-12 w-12 object-contain"
          />
        )}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          <p className="text-sm text-gray-600">🐄 Go 4 Farms & Cattle - Melissa, Texas 🌾</p>
        </div>
      </div>
    </header>
  );
}