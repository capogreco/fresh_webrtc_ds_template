// Preact component

interface LogDisplayProps {
  logs: string[];
}

export function LogDisplay({ logs }: LogDisplayProps) {
  return (
    <div class="log-container">
      <h2>Activity Log</h2>
      <div class="log">
        {logs.map((log, index) => (
          <div key={index} class="log-entry">
            {log}
          </div>
        ))}
      </div>
    </div>
  );
}
