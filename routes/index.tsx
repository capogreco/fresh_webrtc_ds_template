import WebRTC from "../islands/WebRTC.tsx";

export default function Home() {
  return (
    <div>
      <header class="app-header">
        <h1>WebRTC Data Channel Demo</h1>
        <p class="subtitle">Built with Deno Fresh and KV Edge Storage</p>
        <div class="nav-links">
          <a href="/ctrl" class="nav-link">Controller Interface</a>
          <a href="/ctrl/dev" class="nav-link">Dev Controller</a>
        </div>
      </header>
      <WebRTC />
    </div>
  );
}
