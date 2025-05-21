import { defineConfig } from "$fresh/server.ts";
import { FreshConfig } from "$fresh/server.ts";

export default defineConfig({
  // Server configuration removed to use Fresh defaults (port 8000)
  onListen: (params: { hostname: string; port: number }) => {
    console.log(`Fresh server listening on http://${params.hostname}:${params.port}`);
    console.log("\nOther local network interfaces for testing from LAN:");
    try {
      const interfaces = Deno.networkInterfaces();
      let foundLocalIP = false;
      for (const iface of interfaces) {
        if (iface.address && iface.family === "IPv4" && !iface.internal) {
          const isCommonPrivate = iface.address.startsWith("192.168.") || 
                                iface.address.startsWith("10.") || 
                                (iface.address.startsWith("172.") && parseInt(iface.address.split('.')[1], 10) >= 16 && parseInt(iface.address.split('.')[1], 10) <= 31);
          
          if (isCommonPrivate) {
            console.log(`  ${iface.name}: ${iface.address} (Use this for LAN access)`);
            foundLocalIP = true;
          } else {
            console.log(`  ${iface.name}: ${iface.address}`);
          }
        }
      }
      if (!foundLocalIP) {
        console.warn("Could not identify a common private LAN IP address (e.g., 192.168.x.x, 10.x.x.x).");
        console.warn("Please manually check your system's network settings if connecting from another device on the LAN.");
      }
    } catch (error) {
      console.error("Could not retrieve network interfaces:", error);
    }
    console.log(""); // Extra newline
  },
} as FreshConfig);
