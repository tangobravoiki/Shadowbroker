/**
 * Proxy Fetch Utilities
 * 
 * Uses free, keyless CORS proxy services to bypass CORS restrictions.
 * Automatically falls back between multiple proxy services.
 */

// Free CORS proxy services (no API key required)
export const CORS_PROXIES = [
  {
    name: "AllOrigins",
    buildUrl: (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  },
  {
    name: "CORS Proxy IO",
    buildUrl: (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  },
  {
    name: "CORS SH",
    buildUrl: (url: string) => `https://cors.sh/${url}`,
  },
];

// Free RSS-to-JSON services (no API key required)  
export const RSS_PROXIES = [
  {
    name: "RSS2JSON",
    buildUrl: (feedUrl: string) => `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`,
    parseResponse: async (res: Response) => {
      const json = await res.json();
      if (json.status === "ok") {
        return json.items.map((item: any) => ({
          title: item.title,
          link: item.link,
          pubDate: item.pubDate,
          description: item.description,
          content: item.content,
          thumbnail: item.thumbnail || item.enclosure?.link,
          author: item.author,
          categories: item.categories,
        }));
      }
      throw new Error(json.message || "RSS2JSON failed");
    },
  },
  {
    name: "Feed2JSON",
    buildUrl: (feedUrl: string) => `https://feed2json.org/convert?url=${encodeURIComponent(feedUrl)}`,
    parseResponse: async (res: Response) => {
      const json = await res.json();
      if (json.items) {
        return json.items.map((item: any) => ({
          title: item.title,
          link: item.url || item.id,
          pubDate: item.date_published || item.date_modified,
          description: item.summary || item.content_text,
          content: item.content_html || item.content_text,
          thumbnail: item.image,
          author: item.author?.name,
        }));
      }
      throw new Error("Feed2JSON failed");
    },
  },
];

export interface RssItem {
  title: string;
  link: string;
  pubDate: string;
  description?: string;
  content?: string;
  thumbnail?: string;
  author?: string;
  categories?: string[];
}

/**
 * Fetch with CORS proxy fallback
 */
export async function fetchWithCorsProxy(url: string, timeout = 10000): Promise<Response> {
  // First try direct fetch
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) return res;
  } catch {
    clearTimeout(timeoutId);
  }

  // Try each proxy
  for (const proxy of CORS_PROXIES) {
    const proxyUrl = proxy.buildUrl(url);
    const proxyController = new AbortController();
    const proxyTimeoutId = setTimeout(() => proxyController.abort(), timeout);

    try {
      const res = await fetch(proxyUrl, { signal: proxyController.signal });
      clearTimeout(proxyTimeoutId);
      if (res.ok) return res;
    } catch {
      clearTimeout(proxyTimeoutId);
    }
  }

  throw new Error(`All proxies failed for: ${url}`);
}

/**
 * Fetch RSS feed with automatic proxy fallback
 */
export async function fetchRssFeed(feedUrl: string, timeout = 10000): Promise<RssItem[]> {
  for (const proxy of RSS_PROXIES) {
    const proxyUrl = proxy.buildUrl(feedUrl);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(proxyUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (res.ok) {
        return await proxy.parseResponse(res);
      }
    } catch {
      clearTimeout(timeoutId);
    }
  }

  throw new Error(`All RSS proxies failed for: ${feedUrl}`);
}

/**
 * Fetch JSON with CORS proxy fallback
 */
export async function fetchJsonWithProxy<T = any>(url: string, timeout = 10000): Promise<T> {
  const res = await fetchWithCorsProxy(url, timeout);
  return res.json();
}
