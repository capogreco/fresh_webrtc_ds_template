import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

console.log("Test server starting on http://localhost:3000");

serve((_req) => {
  return new Response("Hello World from test server!", {
    headers: { "content-type": "text/plain" },
  });
}, { port: 3000 });