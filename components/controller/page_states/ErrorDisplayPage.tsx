// Preact component
import { h } from "preact";

interface ErrorDisplayPageProps {
  error: string;
  details?: string;
  stack?: string;
  quotaExceeded?: boolean;
}

export default function ErrorDisplayPage({
  error,
  details,
  stack,
  quotaExceeded,
}: ErrorDisplayPageProps) {
  return (
    <div class="container">
      <h1>Error</h1>

      {quotaExceeded
        ? (
          <div style="background-color: #ffe8cc; color: #7d4a00; padding: 16px; border-radius: 4px; margin-bottom: 20px; border: 1px solid #ffb459;">
            <h3 style="margin-top: 0;">Deno KV Quota Exceeded</h3>
            <p>
              The application has reached its database read limit. The
              development version will still work properly without requiring
              database access.
            </p>
          </div>
        )
        : <p>{error || "Unknown error"}</p>}

      {details && (
        <div style="margin-top: 20px; padding: 10px; background-color: #f5f5f5; border-radius: 4px;">
          <p>
            <strong>Details:</strong> {details}
          </p>
          {stack && (
            <pre style="margin-top: 10px; white-space: pre-wrap; overflow-x: auto; font-size: 12px; background-color: #f0f0f0; padding: 10px; border-radius: 4px;">
              {stack}
            </pre>
          )}
        </div>
      )}
      <div style="margin-top: 20px;">
        <a
          href="/ctrl/dev"
          class="activate-button"
          style="text-decoration: none; display: inline-block;"
        >
          Use Development Version
        </a>
      </div>
    </div>
  );
}
