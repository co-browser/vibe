import { getStatus } from "./agent";

export interface HealthStatus {
  status: "healthy" | "unhealthy";
  uptime: number;
  agent: {
    initialized: boolean;
    ready: boolean;
  };
  timestamp: string;
}

export function getHealth(): HealthStatus {
  const agentStatus = getStatus();

  return {
    status: agentStatus.ready ? "healthy" : "unhealthy",
    uptime: process.uptime(),
    agent: {
      initialized: agentStatus.initialized,
      ready: agentStatus.ready,
    },
    timestamp: new Date().toISOString(),
  };
}
