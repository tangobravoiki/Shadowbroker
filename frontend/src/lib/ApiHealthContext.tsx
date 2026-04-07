"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { setGlobalApiHealthRecorder } from "@/hooks/useDataPolling";

/**
 * Free & Keyless Proxy Services for CORS bypass
 * Priority: RSS2JSON, FEED2JSON, AllOrigins, corsproxy.io
 */
export const PROXY_SERVICES = {
  // RSS/Feed specific proxies (keyless, free)
  rss2json: {
    name: "RSS2JSON",
    url: "https://api.rss2json.com/v1/api.json?rss_url=",
    rateLimit: 10000, // 10,000 requests/day free tier
    type: "rss",
  },
  feed2json: {
    name: "Feed2JSON", 
    url: "https://feed2json.org/convert?url=",
    rateLimit: Infinity, // No documented limit
    type: "rss",
  },
  // General CORS proxies (keyless, free)
  allorigins: {
    name: "AllOrigins",
    url: "https://api.allorigins.win/raw?url=",
    rateLimit: Infinity, // No documented limit
    type: "cors",
  },
  corsproxy: {
    name: "CORS Proxy",
    url: "https://corsproxy.io/?",
    rateLimit: Infinity,
    type: "cors",
  },
  corsanywhere: {
    name: "CORS Anywhere",
    url: "https://cors-anywhere.herokuapp.com/",
    rateLimit: 200, // 200 requests/hour
    type: "cors",
  },
} as const;

export type ProxyServiceKey = keyof typeof PROXY_SERVICES;

export interface ApiHealth {
  name: string;
  status: "healthy" | "degraded" | "down" | "unknown";
  lastCheck: Date | null;
  responseTime: number | null; // ms
  requestsUsed: number;
  requestsLimit: number | null;
  errorMessage?: string;
}

export interface ApiHealthState {
  // Backend APIs
  backend: ApiHealth;
  // External free APIs
  wikipedia: ApiHealth;
  usgs: ApiHealth;
  nasaGibs: ApiHealth;
  nasaFirms: ApiHealth;
  opensky: ApiHealth;
  // Proxy services
  rss2json: ApiHealth;
  feed2json: ApiHealth;
  allorigins: ApiHealth;
  corsproxy: ApiHealth;
}

const defaultHealth: ApiHealth = {
  name: "Unknown",
  status: "unknown",
  lastCheck: null,
  responseTime: null,
  requestsUsed: 0,
  requestsLimit: null,
};

const initialState: ApiHealthState = {
  backend: { ...defaultHealth, name: "Backend Server", requestsLimit: null },
  wikipedia: { ...defaultHealth, name: "Wikipedia API", requestsLimit: 200 }, // 200/s
  usgs: { ...defaultHealth, name: "USGS Earthquake", requestsLimit: null },
  nasaGibs: { ...defaultHealth, name: "NASA GIBS", requestsLimit: null },
  nasaFirms: { ...defaultHealth, name: "NASA FIRMS", requestsLimit: null },
  opensky: { ...defaultHealth, name: "OpenSky Network", requestsLimit: 400 }, // 400/day anonymous
  rss2json: { ...defaultHealth, name: "RSS2JSON", requestsLimit: 10000 },
  feed2json: { ...defaultHealth, name: "Feed2JSON", requestsLimit: null },
  allorigins: { ...defaultHealth, name: "AllOrigins", requestsLimit: null },
  corsproxy: { ...defaultHealth, name: "CORS Proxy", requestsLimit: null },
};

interface ApiHealthContextValue {
  health: ApiHealthState;
  checkAllHealth: () => Promise<void>;
  recordApiCall: (api: keyof ApiHealthState, success: boolean, responseTime?: number) => void;
  getHealthyProxy: (type: "rss" | "cors") => ProxyServiceKey | null;
  fetchWithProxy: (url: string, type?: "rss" | "cors") => Promise<Response>;
}

const ApiHealthContext = createContext<ApiHealthContextValue | null>(null);

// Storage keys for persisting request counts
const STORAGE_KEY = "api_health_counts";
const STORAGE_DATE_KEY = "api_health_date";

export function ApiHealthProvider({ children }: { children: React.ReactNode }) {
  const [health, setHealth] = useState<ApiHealthState>(initialState);
  const checkInProgress = useRef(false);

  // Load persisted counts on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    const today = new Date().toDateString();
    const storedDate = localStorage.getItem(STORAGE_DATE_KEY);
    
    if (storedDate !== today) {
      // Reset daily counts
      localStorage.setItem(STORAGE_DATE_KEY, today);
      localStorage.removeItem(STORAGE_KEY);
    } else {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const counts = JSON.parse(stored);
          setHealth(prev => {
            const updated = { ...prev };
            for (const key of Object.keys(counts)) {
              if (updated[key as keyof ApiHealthState]) {
                updated[key as keyof ApiHealthState] = {
                  ...updated[key as keyof ApiHealthState],
                  requestsUsed: counts[key],
                };
              }
            }
            return updated;
          });
        } catch {}
      }
    }
  }, []);

  // Record API call
  const recordApiCall = useCallback((api: keyof ApiHealthState, success: boolean, responseTime?: number) => {
    setHealth(prev => {
      const updated = {
        ...prev,
        [api]: {
          ...prev[api],
          status: success ? "healthy" : "degraded",
          lastCheck: new Date(),
          responseTime: responseTime ?? prev[api].responseTime,
          requestsUsed: prev[api].requestsUsed + 1,
        } as ApiHealth,
      };
      
      // Persist counts
      if (typeof window !== "undefined") {
        const counts: Record<string, number> = {};
        for (const key of Object.keys(updated)) {
          counts[key] = updated[key as keyof ApiHealthState].requestsUsed;
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(counts));
      }
      
      return updated;
    });
  }, []);

  // Check health of a single endpoint
  const checkEndpoint = useCallback(async (
    url: string,
    key: keyof ApiHealthState,
    timeout = 5000
  ): Promise<void> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    const start = performance.now();

    try {
      const res = await fetch(url, { 
        signal: controller.signal,
        method: "HEAD",
        mode: "cors",
      });
      const responseTime = Math.round(performance.now() - start);
      
      setHealth(prev => ({
        ...prev,
        [key]: {
          ...prev[key],
          status: res.ok ? "healthy" : "degraded",
          lastCheck: new Date(),
          responseTime,
        },
      }));
    } catch (err) {
      setHealth(prev => ({
        ...prev,
        [key]: {
          ...prev[key],
          status: "down",
          lastCheck: new Date(),
          errorMessage: err instanceof Error ? err.message : "Unknown error",
        },
      }));
    } finally {
      clearTimeout(timeoutId);
    }
  }, []);

  // Check all API health
  const checkAllHealth = useCallback(async () => {
    if (checkInProgress.current) return;
    checkInProgress.current = true;

    const checks = [
      // Backend
      checkEndpoint("/api/live-data/fast", "backend"),
      // Free APIs
      checkEndpoint("https://en.wikipedia.org/api/rest_v1/page/summary/Test", "wikipedia"),
      checkEndpoint("https://earthquake.usgs.gov/fdsnws/event/1/version", "usgs"),
      checkEndpoint("https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/wmts.cgi?SERVICE=WMTS&REQUEST=GetCapabilities", "nasaGibs"),
      // Proxy services
      checkEndpoint("https://api.rss2json.com/v1/api.json", "rss2json"),
      checkEndpoint("https://feed2json.org/", "feed2json"),
      checkEndpoint("https://api.allorigins.win/raw?url=https://example.com", "allorigins"),
    ];

    await Promise.allSettled(checks);
    checkInProgress.current = false;
  }, [checkEndpoint]);

  // Initial health check
  useEffect(() => {
    checkAllHealth();
    // Re-check every 5 minutes
    const interval = setInterval(checkAllHealth, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [checkAllHealth]);

  // Register global recorder for useDataPolling
  useEffect(() => {
    setGlobalApiHealthRecorder((api, success, responseTime) => {
      if (api === 'backend') {
        recordApiCall('backend', success, responseTime);
      }
    });
    return () => setGlobalApiHealthRecorder(null);
  }, [recordApiCall]);

  // Get a healthy proxy for the given type
  const getHealthyProxy = useCallback((type: "rss" | "cors"): ProxyServiceKey | null => {
    const proxies: ProxyServiceKey[] = type === "rss" 
      ? ["rss2json", "feed2json"] 
      : ["allorigins", "corsproxy"];
    
    for (const key of proxies) {
      const h = health[key];
      if (h.status !== "down") {
        // Check rate limit
        if (h.requestsLimit && h.requestsUsed >= h.requestsLimit) continue;
        return key;
      }
    }
    return proxies[0]; // Fallback to first
  }, [health]);

  // Fetch with automatic proxy selection and fallback
  const fetchWithProxy = useCallback(async (url: string, type: "rss" | "cors" = "cors"): Promise<Response> => {
    const proxies: ProxyServiceKey[] = type === "rss"
      ? ["rss2json", "feed2json", "allorigins"]
      : ["allorigins", "corsproxy"];
    
    let lastError: Error | null = null;

    for (const proxyKey of proxies) {
      const proxy = PROXY_SERVICES[proxyKey];
      const proxyUrl = proxy.url + encodeURIComponent(url);
      const start = performance.now();

      try {
        const res = await fetch(proxyUrl);
        const responseTime = Math.round(performance.now() - start);
        
        if (res.ok) {
          recordApiCall(proxyKey, true, responseTime);
          return res;
        }
        
        recordApiCall(proxyKey, false, responseTime);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        recordApiCall(proxyKey, false);
      }
    }

    throw lastError || new Error("All proxies failed");
  }, [recordApiCall]);

  return (
    <ApiHealthContext.Provider value={{ health, checkAllHealth, recordApiCall, getHealthyProxy, fetchWithProxy }}>
      {children}
    </ApiHealthContext.Provider>
  );
}

export function useApiHealth() {
  const ctx = useContext(ApiHealthContext);
  if (!ctx) {
    throw new Error("useApiHealth must be used within ApiHealthProvider");
  }
  return ctx;
}

// Hook for components that might render outside provider (safe fallback)
export function useApiHealthSafe() {
  const ctx = useContext(ApiHealthContext);
  return ctx;
}
