import WebRTC from "../islands/WebRTC.tsx";
import { DEV_MODE } from "../lib/config.ts";

export default function Home() {
  const isDevMode = DEV_MODE;
  return (
    <div>
      <header class="app-header">
        <div class="nav-links">
          {/* "Controller Interface" link removed */}
          {/* "Dev Controller" link moved and made conditional below */}
        </div>
      </header>
      <WebRTC />
      {isDevMode && (
        <div style="text-align: center; padding-top: 20px; padding-bottom: 20px; margin-top: 30px; border-top: 1px solid #eee;">
          <a
            href="/ctrl/dev"
            class="nav-link"
            style="font-size: 0.9em; padding: 8px 15px; background-color: #f0f0f0; border-radius: 4px;"
          >
            Dev Controller
          </a>
        </div>
      )}
    </div>
  );
}
