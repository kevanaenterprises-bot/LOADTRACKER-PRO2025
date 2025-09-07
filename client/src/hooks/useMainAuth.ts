import { useAdminAuth } from "./useAdminAuth";
import { useDriverAuth } from "./useDriverAuth";
import { useAuth } from "./useAuth";
import { useMemo } from "react";

/**
 * Main authentication hook that consolidates all auth methods
 * Uses priority: admin > driver > regular auth
 * Prevents race conditions by memoizing results
 */
export function useMainAuth() {
  const adminAuth = useAdminAuth();
  const driverAuth = useDriverAuth();
  const regularAuth = useAuth();
  
  return useMemo(() => {
    // Admin auth takes highest priority
    if (adminAuth.isAuthenticated) {
      return {
        ...adminAuth,
        authType: 'admin' as const
      };
    }
    
    // Driver auth is second priority
    if (driverAuth.isAuthenticated) {
      return {
        ...driverAuth,
        authType: 'driver' as const
      };
    }
    
    // Regular auth is fallback
    if (regularAuth.isAuthenticated) {
      return {
        ...regularAuth,
        authType: 'regular' as const
      };
    }
    
    // If any auth is still loading, show loading state
    if (adminAuth.isLoading || driverAuth.isLoading || regularAuth.isLoading) {
      return {
        user: null,
        isLoading: true,
        isAuthenticated: false,
        authType: 'loading' as const
      };
    }
    
    // No authentication found
    return {
      user: null,
      isLoading: false,
      isAuthenticated: false,
      authType: 'none' as const
    };
  }, [
    adminAuth.isAuthenticated, adminAuth.isLoading, adminAuth.user,
    driverAuth.isAuthenticated, driverAuth.isLoading, driverAuth.user,
    regularAuth.isAuthenticated, regularAuth.isLoading, regularAuth.user
  ]);
}