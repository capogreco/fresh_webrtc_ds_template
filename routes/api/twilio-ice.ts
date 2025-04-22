import { Handlers } from "$fresh/server.ts";

// Set the Time-To-Live for the Twilio TURN credentials
const TTL = 3600; // 1 hour in seconds

export const handler: Handlers = {
  async GET(req) {
    try {
      const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
      const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");

      if (!accountSid || !authToken) {
        return new Response(
          JSON.stringify({
            error: "Missing Twilio credentials",
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
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

        return new Response(
          JSON.stringify({
            error: "Failed to retrieve Twilio ICE servers",
            details: errorText,
          }),
          {
            status: response.status,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const data = await response.json();

      // Extract the ICE servers from the response
      const iceServers = data.ice_servers;

      return new Response(
        JSON.stringify({ iceServers }),
        {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": `public, max-age=${TTL}`,
          },
        },
      );
    } catch (error) {
      console.error("Error fetching Twilio ICE servers:", error);

      return new Response(
        JSON.stringify({
          error: "Internal server error",
          details: error.message,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};
