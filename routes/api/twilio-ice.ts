import { Handlers } from "$fresh/server.ts";

// Set the Time-To-Live for the Twilio TURN credentials
const TTL = 3600; // 1 hour in seconds

// Fallback STUN servers to use when Twilio credentials are not available
const FALLBACK_ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];

export const handler: Handlers = {
  async GET(req) {
    try {
      const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
      const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");

      if (!accountSid || !authToken) {
        console.log("Missing Twilio credentials, using fallback STUN servers");
        return new Response(
          JSON.stringify({
            iceServers: FALLBACK_ICE_SERVERS,
            source: "fallback",
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": `public, max-age=${TTL}`,
            },
          },
        );
      }

      // Create a timestamp that will be valid for TTL seconds
      const timestamp = Math.floor(Date.now() / 1000) + TTL;

      // Make a request to Twilio's API to get the TURN servers
      const twilioUrl =
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Tokens.json`;

      const response = await fetch(twilioUrl, {
        method: "POST",
        headers: {
          "Authorization": "Basic " + btoa(`${accountSid}:${authToken}`),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `Ttl=${TTL}`,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Twilio API error:", errorText);

        // If Twilio fails, use fallback STUN servers
        return new Response(
          JSON.stringify({
            iceServers: FALLBACK_ICE_SERVERS,
            source: "fallback-after-error",
            error: "Failed to retrieve Twilio ICE servers",
          }),
          {
            status: 200, // Return 200 with fallback servers
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": `public, max-age=${TTL}`,
            },
          },
        );
      }

      const data = await response.json();

      // Extract the ICE servers from the response
      const iceServers = data.ice_servers;

      return new Response(
        JSON.stringify({
          iceServers,
          source: "twilio",
        }),
        {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": `public, max-age=${TTL}`,
          },
        },
      );
    } catch (error) {
      console.error("Error fetching Twilio ICE servers:", error);

      // Return fallback servers even if an exception occurs
      return new Response(
        JSON.stringify({
          iceServers: FALLBACK_ICE_SERVERS,
          source: "fallback-after-exception",
          error: "Internal server error",
        }),
        {
          status: 200, // Return 200 with fallback servers
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": `public, max-age=${TTL}`,
          },
        },
      );
    }
  },
};
