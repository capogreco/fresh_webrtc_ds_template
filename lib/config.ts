// fresh_webrtc_ds_template/lib/config.ts

/**
 * Development Mode Flag.
 * Set this to true to enable development-specific features,
 * such as bypassing authentication in certain areas or showing dev-only UI elements.
 *
 * For a production build, this should ideally be false or controlled by
 * an environment variable like Deno.env.get("APP_ENV") === "development".
 */
export const DEV_MODE = true;

// Example of how you might use an environment variable for more robust configuration:
// export const IS_DEVELOPMENT_ENV = Deno.env.get("APP_ENV") === "development";
// export const DEV_MODE = IS_DEVELOPMENT_ENV; // Or some other logic

// Add other global configurations here as needed.
// For example:
// export const API_BASE_URL = Deno.env.get("API_URL") || "http://localhost:3000/api";
// export const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") || "";
