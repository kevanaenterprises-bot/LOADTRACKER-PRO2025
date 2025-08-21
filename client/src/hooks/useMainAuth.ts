import { useAdminAuth } from "./useAdminAuth";
import { useDriverAuth } from "./useDriverAuth";
import { useAuth } from "./useAuth";

/**
 * Main authentication hook that prioritizes admin auth, then driver auth, then regular auth
 */
export function useMainAuth() {
  const adminAuth = useAdminAuth();
  const driverAuth = useDriverAuth();
  const regularAuth = useAuth();

  // Determine which auth system to use based on priority and authentication status
  if (adminAuth.isAuthenticated) {
    return {
      ...adminAuth,
      authType: 'admin' as const
    };
  }
  
  if (driverAuth.isAuthenticated) {
    return {
      ...driverAuth,
      authType: 'driver' as const
    };
  }
  
  // If no specific auth is authenticated, show loading state while checking all
  if (adminAuth.isLoading || driverAuth.isLoading || regularAuth.isLoading) {
    return {
      user: null,
      isLoading: true,
      isAuthenticated: false,
      authType: 'unknown' as const
    };
  }
  
  // Default to regular auth for unauthenticated state
  return {
    ...regularAuth,
    authType: 'regular' as const
  };
}