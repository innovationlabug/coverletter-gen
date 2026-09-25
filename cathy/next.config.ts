import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Imagen mínima para Cloud Run (node .next/standalone/server.js).
  output: "standalone",
  // `next dev` crea AGENTS.md/CLAUDE.md al detectar un agente de IA; en este repo no los queremos.
  agentRules: false,
  // El SDK de Vertex y google-auth-library se quedan como dependencias de Node.
  serverExternalPackages: ["@google/genai", "google-auth-library"],
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
