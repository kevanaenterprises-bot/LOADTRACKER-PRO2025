import { useQuery } from "@tanstack/react-query";

export function useDriverAuth() {
  const { data: user, isLoading } = useQuery({
    queryKey: ["/api/auth/driver-user"],
    retry: false,
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
  };
}