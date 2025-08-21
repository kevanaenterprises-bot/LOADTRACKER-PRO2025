import { useAdminAuth } from "./useAdminAuth";
import { useDriverAuth } from "./useDriverAuth";
import { useAuth } from "./useAuth";
import { useEffect, useState } from "react";

/**
 * Main authentication hook that prioritizes admin auth, then driver auth, then regular auth
 */
export function useMainAuth() {
  const adminAuth = useAdminAuth();
  
  // Prioritize admin authentication - if admin is authenticated or loading, only use admin
  if (adminAuth.isAuthenticated) {
    return {
      ...adminAuth,
      authType: 'admin' as const
    };
  }
  
  // If admin is still loading, wait for it
  if (adminAuth.isLoading) {
    return {
      user: null,
      isLoading: true,
      isAuthenticated: false,
      authType: 'admin' as const
    };
  }
  
  // Only check other auth systems if admin auth failed
  const driverAuth = useDriverAuth();
  
  if (driverAuth.isAuthenticated) {
    return {
      ...driverAuth,
      authType: 'driver' as const
    };
  }
  
  if (driverAuth.isLoading) {
    return {
      user: null,
      isLoading: true,
      isAuthenticated: false,
      authType: 'driver' as const
    };
  }
  
  // Finally check regular auth
  const regularAuth = useAuth();
  
  return {
    ...regularAuth,
    authType: 'regular' as const
  };
}