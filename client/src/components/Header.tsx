import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useMainAuth } from "@/hooks/useMainAuth";
import { LayoutDashboard, DollarSign, Fuel, TrendingUp, FileCheck, Truck, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";
import {
  Sheet,
  SheetContent,
  SheetClose,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import logoImage from "../assets/go-farms-logo.png";

interface HeaderProps {
  title?: string;
  showLogo?: boolean;
  showNavigation?: boolean;
}

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Paid Loads", href: "/paid-loads", icon: DollarSign },
  { label: "IFTA Report", href: "/ifta-report", icon: Fuel },
  { label: "Aging Report", href: "/aging-report", icon: TrendingUp },
  { label: "Rate Confirmations", href: "/rate-confirmations", icon: FileCheck },
  { label: "LoadRight", href: "/loadright", icon: Truck },
];

export function Header({ title = "LoadTracker Pro", showLogo = true, showNavigation = true }: HeaderProps) {
  const [location] = useLocation();
  const { isAuthenticated } = useMainAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="bg-white shadow-md border-b border-gray-200 px-6 py-4 sticky top-0 z-50">
      <div className="flex items-center justify-between gap-4">
        {/* Logo and Title */}
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

        {/* Desktop Navigation */}
        {showNavigation && isAuthenticated && (
          <>
            <NavigationMenu className="hidden md:flex">
              <NavigationMenuList>
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location === item.href;
                  return (
                    <NavigationMenuItem key={item.href}>
                      <Link href={item.href}>
                        <Button
                          variant={isActive ? "default" : "ghost"}
                          className={cn(
                            "gap-2",
                            isActive && "bg-primary text-primary-foreground"
                          )}
                          data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </Button>
                      </Link>
                    </NavigationMenuItem>
                  );
                })}
              </NavigationMenuList>
            </NavigationMenu>

            {/* Mobile Navigation */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="md:hidden"
                  data-testid="button-admin-nav"
                >
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right">
                <SheetHeader>
                  <SheetTitle>Navigation</SheetTitle>
                </SheetHeader>
                <div className="flex flex-col gap-2 mt-6">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location === item.href;
                    return (
                      <SheetClose asChild key={item.href}>
                        <Link href={item.href}>
                          <Button
                            variant={isActive ? "default" : "ghost"}
                            className={cn(
                              "w-full justify-start gap-2",
                              isActive && "bg-primary text-primary-foreground"
                            )}
                            data-testid={`mobile-nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                          >
                            <Icon className="h-4 w-4" />
                            {item.label}
                          </Button>
                        </Link>
                      </SheetClose>
                    );
                  })}
                </div>
              </SheetContent>
            </Sheet>
          </>
        )}
      </div>
    </header>
  );
}