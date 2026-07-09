import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev-only: navegador de verificação (Playwright em Docker) acessa o dev
  // server via host.docker.internal; sem isto o Next bloqueia assets/RSC.
  allowedDevOrigins: ["host.docker.internal"],
};

export default nextConfig;
