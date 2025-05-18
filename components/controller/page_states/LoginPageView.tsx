// Preact component
import { h } from "preact";

interface LoginPageViewProps {
  loginUrl: string;
  sessionExpired?: boolean;
}

export default function LoginPageView({
  loginUrl,
  sessionExpired,
}: LoginPageViewProps) {
  return (
    <div class="container" style="max-width: 500px; text-align: center;">
      <h1>WebRTC Controller Login</h1>

      {sessionExpired ? (
        <div
          class="alert"
          style="margin-bottom: 20px; color: #e53e3e; background-color: rgba(229, 62, 62, 0.1); padding: 12px; border-radius: 4px; border: 1px solid #e53e3e;"
        >
          Your session has expired. Please log in again.
        </div>
      ) : (
        <p>
          Please log in with your Google account to access the controller
          interface.
        </p>
      )}

      <div style="margin-top: 30px;">
        {loginUrl ? (
          <a
            href={loginUrl}
            class="activate-button"
            style="text-decoration: none; display: inline-block;"
          >
            Login with Google
          </a>
        ) : (
          <div>
            <p style="color: #e53e3e;">
              Unable to generate login URL. OAuth configuration may be
              incomplete.
            </p>
            <a
              href="/ctrl/dev"
              class="activate-button"
              style="text-decoration: none; display: inline-block; margin-top: 20px;"
            >
              Use Development Version
            </a>
          </div>
        )}
      </div>
    </div>
  );
}