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
  // Always ensure bypass token is available - retry up to 3 times
  let bypassToken = localStorage.getItem('bypass-token');
  let retries = 0;
  
  while (!bypassToken && retries < 3) {
    try {
      console.log(`🔄 Attempting to get bypass token (attempt ${retries + 1})`);
      const response = await fetch("/api/auth/browser-bypass", {
        method: "POST",
        credentials: "include",
      });
      if (response.ok) {
        const tokenData = await response.json();
        localStorage.setItem('bypass-token', tokenData.token);
        bypassToken = tokenData.token;
        console.log("✅ Bypass token obtained successfully");
        break;
      } else {
        console.warn(`⚠️ Bypass token request failed with status: ${response.status}`);
      }
    } catch (error) {
      console.warn(`⚠️ Bypass token request error:`, error);
    }
    retries++;
    if (retries < 3) {
      await new Promise(resolve => setTimeout(resolve, 100)); // Small delay between retries
    }
  }
  
  const headers: any = data ? { "Content-Type": "application/json" } : {};
  
  if (bypassToken) {
    headers['X-Bypass-Token'] = bypassToken;
    console.log("🔑 Using bypass token for API request");
  } else {
    console.warn("⚠️ No bypass token available - API request may fail");
  }

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return await res.json();
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // Ensure bypass token is available - retry if needed
    let bypassToken = localStorage.getItem('bypass-token');
    if (!bypassToken) {
      try {
        console.log("🔄 Query function getting bypass token");
        const response = await fetch("/api/auth/browser-bypass", {
          method: "POST",
          credentials: "include",
        });
        if (response.ok) {
          const tokenData = await response.json();
          localStorage.setItem('bypass-token', tokenData.token);
          bypassToken = tokenData.token;
          console.log("✅ Query function bypass token obtained");
        }
      } catch (error) {
        console.warn("⚠️ Query function bypass token failed:", error);
      }
    }
    
    const headers: any = {};
    if (bypassToken) {
      headers['X-Bypass-Token'] = bypassToken;
    }

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
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
