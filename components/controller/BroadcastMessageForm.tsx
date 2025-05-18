// Preact component
import { h } from "preact";
import { useSignal } from "@preact/signals";
import { useClientManagerContext } from "../../lib/contexts.ts";

interface BroadcastMessageFormProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export function BroadcastMessageForm({
  onSend: propOnSend,
  disabled = false,
}: BroadcastMessageFormProps) {
  // Try to use context, fall back to props if not available
  let clientManager;
  try {
    clientManager = useClientManagerContext();
  } catch (error) {
    // Context not available, use props
    clientManager = null;
  }

  // Use context value if available, otherwise use prop
  const onSend = clientManager?.broadcastMessage || propOnSend;
  const messageText = useSignal("");

  const handleSubmit = (e: Event) => {
    e.preventDefault();

    if (messageText.value.trim() === "") {
      return;
    }

    onSend(messageText.value);
    messageText.value = "";
  };

  return (
    <div class="broadcast-container">
      <h2>Broadcast Message</h2>
      <form onSubmit={handleSubmit} class="broadcast-form">
        <input
          type="text"
          value={messageText.value}
          onInput={(
            e,
          ) => (messageText.value = (e.target as HTMLInputElement).value)}
          placeholder="Enter message to broadcast to all clients"
          disabled={disabled}
          class="broadcast-input"
        />
        <button
          type="submit"
          disabled={disabled || messageText.value.trim() === ""}
          class="btn broadcast-button"
        >
          Send
        </button>
      </form>
    </div>
  );
}
