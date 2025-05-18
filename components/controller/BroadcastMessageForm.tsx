// Preact component
import { useSignal } from "@preact/signals";

interface BroadcastMessageFormProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export function BroadcastMessageForm({
  onSend,
  disabled = false,
}: BroadcastMessageFormProps) {
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
