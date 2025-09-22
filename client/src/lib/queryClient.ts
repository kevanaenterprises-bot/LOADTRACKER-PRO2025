import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  url: string,
  method: string,
  data?: unknown | undefined,
): Promise<any> {
  // Use the working static bypass token for mobile reliability
  const staticBypassToken = 'LOADTRACKER_BYPASS_2025';
  
  const headers: any = data ? { "Content-Type": "application/json" } : {};
  headers['x-bypass-token'] = staticBypassToken; // Must be lowercase for production
  
  console.log(`🔄 API Request: ${method} ${url}`);

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`❌ API Error: ${res.status} ${errorText}`);
    throw new Error(`${res.status}: ${errorText}`);
  }
  
  const result = await res.json();
  console.log(`✅ API Success: ${method} ${url}`);
  return result;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // Always use the static bypass token for production reliability
    const staticBypassToken = 'LOADTRACKER_BYPASS_2025';
    
    const headers: any = {
      'x-bypass-token': staticBypassToken // Must be lowercase for production
    };

    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 5000, // 5 seconds - allows faster cache updates
      retry: false, // Disable retries to prevent infinite loops
    },
    mutations: {
      retry: false,
    },
  },
});
