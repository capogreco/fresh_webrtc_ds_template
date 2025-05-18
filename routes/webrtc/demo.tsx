import { h } from "preact";
import SimpleWebRTC from "../../components/webrtc/SimpleWebRTC.tsx";

export default function WebRTCDemoPage() {
  return (
    <div class="webrtc-demo-page">
      <header>
        <h1>WebRTC Demo</h1>
        <p>
          This demo showcases the refactored WebRTC implementation with modular architecture.
          Use two browser windows to test the peer-to-peer connection.
        </p>
      </header>
      
      <div class="demo-container">
        <SimpleWebRTC />
      </div>
      
      <footer>
        <p>
          <a href="/">Back to Home</a>
        </p>
      </footer>
      
      <style>
        {`
        .webrtc-demo-page {
          font-family: system-ui, -apple-system, sans-serif;
          max-width: 900px;
          margin: 0 auto;
          padding: 20px;
        }
        
        header {
          margin-bottom: 30px;
          border-bottom: 1px solid #eaeaea;
          padding-bottom: 20px;
        }
        
        h1 {
          margin-bottom: 10px;
        }
        
        .demo-container {
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
          padding: 20px;
          margin-bottom: 30px;
        }
        
        footer {
          margin-top: 40px;
          text-align: center;
          color: #666;
        }
        
        a {
          color: #0070f3;
          text-decoration: none;
        }
        
        a:hover {
          text-decoration: underline;
        }
        `}
      </style>
    </div>
  );
}