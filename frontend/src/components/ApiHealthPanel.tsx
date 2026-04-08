"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Activity, 
  Wifi, 
  WifiOff, 
  AlertTriangle, 
  ChevronDown, 
  ChevronUp, 
  RefreshCw,
  Server,
  Globe,
  Rss,
  Clock
} from "lucide-react";
import { useApiHealthSafe, type ApiHealthState } from "@/lib/ApiHealthContext";

function StatusDot({ status }: { status: "healthy" | "degraded" | "down" | "unknown" }) {
  const colors = {
    healthy: "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]",
    degraded: "bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.6)]",
    down: "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]",
    unknown: "bg-gray-500",
  };
  
  return (
    <div className={`w-2 h-2 rounded-full ${colors[status]} ${status === "healthy" ? "animate-pulse" : ""}`} />
  );
}

function formatTime(date: Date | null): string {
  if (!date) return "Never";
  const diff = Date.now() - date.getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

function formatLimit(used: number, limit: number | null): string {
  if (limit === null) return `${used} used`;
  const pct = Math.round((used / limit) * 100);
  return `${used}/${limit} (${pct}%)`;
}

function LimitBar({ used, limit }: { used: number; limit: number | null }) {
  if (limit === null) return null;
  const pct = Math.min((used / limit) * 100, 100);
  const color = pct > 80 ? "bg-red-500" : pct > 50 ? "bg-yellow-500" : "bg-green-500";
  
  return (
    <div className="w-full h-1 bg-[var(--bg-tertiary)] rounded-full overflow-hidden mt-1">
      <div className={`h-full ${color} transition-all duration-300`} style={{ width: `${pct}%` }} />
    </div>
  );
}

interface ApiRowProps {
  name: string;
  status: "healthy" | "degraded" | "down" | "unknown";
  responseTime: number | null;
  lastCheck: Date | null;
  requestsUsed: number;
  requestsLimit: number | null;
  icon: React.ReactNode;
  compact?: boolean;
}

function ApiRow({ name, status, responseTime, lastCheck, requestsUsed, requestsLimit, icon, compact }: ApiRowProps) {
  if (compact) {
    return (
      <div className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-[var(--bg-secondary)]/50 transition-colors">
        <div className="flex items-center gap-2">
          <StatusDot status={status} />
          <span className="text-[9px] text-[var(--text-secondary)] font-mono">{name}</span>
        </div>
        <div className="flex items-center gap-2">
          {responseTime !== null && (
            <span className="text-[8px] text-[var(--text-muted)] font-mono">{responseTime}ms</span>
          )}
          {requestsLimit !== null && (
            <span className={`text-[8px] font-mono ${requestsUsed / requestsLimit > 0.8 ? "text-red-400" : "text-[var(--text-muted)]"}`}>
              {Math.round((requestsUsed / requestsLimit) * 100)}%
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col p-2 rounded-lg border border-[var(--border-primary)]/50 bg-[var(--bg-secondary)]/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="text-[var(--text-muted)]">{icon}</div>
          <span className="text-[10px] text-[var(--text-primary)] font-mono font-bold">{name}</span>
        </div>
        <StatusDot status={status} />
      </div>
      <div className="flex items-center justify-between mt-2 text-[8px] text-[var(--text-muted)] font-mono">
        <span className="flex items-center gap-1">
          <Clock size={8} />
          {formatTime(lastCheck)}
        </span>
        {responseTime !== null && (
          <span className={responseTime > 1000 ? "text-yellow-400" : "text-green-400"}>{responseTime}ms</span>
        )}
      </div>
      {requestsLimit !== null && (
        <>
          <div className="text-[8px] text-[var(--text-muted)] font-mono mt-1">
            {formatLimit(requestsUsed, requestsLimit)}
          </div>
          <LimitBar used={requestsUsed} limit={requestsLimit} />
        </>
      )}
    </div>
  );
}

export default function ApiHealthPanel({ compact = false }: { compact?: boolean }) {
  const apiHealth = useApiHealthSafe();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  if (!apiHealth) {
    return null;
  }

  const { health, checkAllHealth } = apiHealth;

  // Calculate overall status
  const statuses = Object.values(health).map(h => h.status);
  const healthyCount = statuses.filter(s => s === "healthy").length;
  const downCount = statuses.filter(s => s === "down").length;
  const overallStatus = downCount > 2 ? "down" : downCount > 0 ? "degraded" : healthyCount > 0 ? "healthy" : "unknown";

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await checkAllHealth();
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  // Group APIs
  const backendApis = ["backend"] as const;
  const externalApis = ["wikipedia", "usgs", "nasaGibs", "nasaFirms", "opensky"] as const;
  const proxyApis = ["rss2json", "feed2json", "allorigins", "corsproxy"] as const;

  const getIcon = (key: string) => {
    if (key === "backend") return <Server size={12} />;
    if (key.includes("rss") || key.includes("feed")) return <Rss size={12} />;
    return <Globe size={12} />;
  };

  if (compact) {
    return (
      <div className="glass-panel rounded-lg overflow-hidden">
        <div
          className="flex items-center justify-between p-2 cursor-pointer hover:bg-[var(--bg-secondary)]/50 transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            {overallStatus === "healthy" ? (
              <Wifi size={12} className="text-green-400" />
            ) : overallStatus === "degraded" ? (
              <AlertTriangle size={12} className="text-yellow-400" />
            ) : (
              <WifiOff size={12} className="text-red-400" />
            )}
            <span className="text-[9px] text-[var(--text-muted)] font-mono tracking-widest">API STATUS</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[9px] font-mono ${
              overallStatus === "healthy" ? "text-green-400" : 
              overallStatus === "degraded" ? "text-yellow-400" : "text-red-400"
            }`}>
              {healthyCount}/{statuses.length}
            </span>
            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </div>
        </div>

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="border-t border-[var(--border-primary)]/50 p-2 flex flex-col gap-0.5 max-h-[300px] overflow-y-auto styled-scrollbar">
                {/* Backend */}
                <div className="text-[8px] text-[var(--text-muted)] font-mono tracking-widest mt-1 mb-0.5">BACKEND</div>
                {backendApis.map(key => (
                  <ApiRow key={key} {...health[key]} icon={getIcon(key)} compact />
                ))}

                {/* External APIs */}
                <div className="text-[8px] text-[var(--text-muted)] font-mono tracking-widest mt-2 mb-0.5">FREE APIs</div>
                {externalApis.map(key => (
                  <ApiRow key={key} {...health[key]} icon={getIcon(key)} compact />
                ))}

                {/* Proxy Services */}
                <div className="text-[8px] text-[var(--text-muted)] font-mono tracking-widest mt-2 mb-0.5">CORS PROXIES</div>
                {proxyApis.map(key => (
                  <ApiRow key={key} {...health[key]} icon={getIcon(key)} compact />
                ))}

                {/* Refresh button */}
                <button
                  onClick={(e) => { e.stopPropagation(); handleRefresh(); }}
                  disabled={isRefreshing}
                  className="mt-2 flex items-center justify-center gap-1.5 text-[8px] font-mono text-[var(--text-muted)] hover:text-cyan-400 transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={10} className={isRefreshing ? "animate-spin" : ""} />
                  {isRefreshing ? "CHECKING..." : "REFRESH"}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Full panel view
  return (
    <div className="glass-panel rounded-xl overflow-hidden shadow-[0_4px_30px_rgba(0,0,0,0.4)]">
      <div className="flex items-center justify-between p-4 border-b border-[var(--border-primary)]/50">
        <div className="flex items-center gap-2">
          <Activity size={14} className={
            overallStatus === "healthy" ? "text-green-400" : 
            overallStatus === "degraded" ? "text-yellow-400" : "text-red-400"
          } />
          <span className="text-[10px] text-[var(--text-muted)] font-mono tracking-widest">API HEALTH MONITOR</span>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-1 text-[9px] font-mono text-[var(--text-muted)] hover:text-cyan-400 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={isRefreshing ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="p-4 flex flex-col gap-4 max-h-[400px] overflow-y-auto styled-scrollbar">
        {/* Backend */}
        <div>
          <div className="text-[9px] text-[var(--text-muted)] font-mono tracking-widest mb-2">BACKEND SERVICES</div>
          <div className="grid gap-2">
            {backendApis.map(key => (
              <ApiRow key={key} {...health[key]} icon={getIcon(key)} />
            ))}
          </div>
        </div>

        {/* External APIs */}
        <div>
          <div className="text-[9px] text-[var(--text-muted)] font-mono tracking-widest mb-2">FREE EXTERNAL APIs</div>
          <div className="grid gap-2">
            {externalApis.map(key => (
              <ApiRow key={key} {...health[key]} icon={getIcon(key)} />
            ))}
          </div>
        </div>

        {/* Proxy Services */}
        <div>
          <div className="text-[9px] text-[var(--text-muted)] font-mono tracking-widest mb-2">CORS PROXY SERVICES</div>
          <div className="grid gap-2">
            {proxyApis.map(key => (
              <ApiRow key={key} {...health[key]} icon={getIcon(key)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
