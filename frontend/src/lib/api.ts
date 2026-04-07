// API base URL resolution:
//
// 1. NEXT_PUBLIC_API_BASE env var (set in GitHub Pages build via repo secret)
//    → points to Fly.io backend, e.g. "https://shadowbroker-backend.fly.dev"
//
// 2. "" (empty string) — fallback for local dev / Docker
//    → relative paths (/api/...) are proxied to BACKEND_URL by
//      src/app/api/[...path]/route.ts at runtime
//
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";
