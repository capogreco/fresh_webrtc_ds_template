// Preact component
import { h } from "preact";
import { useSignal } from "@preact/signals";
import { useClientManagerContext } from "../../lib/contexts.ts";

interface AddClientFormProps {
  onAddClient: (clientId: string) => void;
  disabled?: boolean;
}

export function AddClientForm({
  onAddClient: propAddClient,
  disabled = false,
}: AddClientFormProps) {
  // Try to use context, fall back to props if not available
  let clientManager;
  try {
    clientManager = useClientManagerContext();
  } catch (error) {
    // Context not available, use props
    clientManager = null;
  }
  
  // Use context value if available, otherwise use prop
  const onAddClient = clientManager?.addClient || propAddClient;
  const newClientId = useSignal("");

  const handleSubmit = (e: Event) => {
    e.preventDefault();

    if (newClientId.value.trim() === "") {
      return;
    }

    onAddClient(newClientId.value.trim());
    newClientId.value = "";
  };

  return (
    <div class="add-client-container">
      <h2>Add Client</h2>
      <form onSubmit={handleSubmit} class="add-client-form">
        <input
          type="text"
          value={newClientId.value}
          onInput={(
            e,
          ) => (newClientId.value = (e.target as HTMLInputElement).value)}
          placeholder="Enter client ID to connect"
          disabled={disabled}
          class="add-client-input"
        />
        <button
          type="submit"
          disabled={disabled || newClientId.value.trim() === ""}
          class="btn add-client-button"
        >
          Add Client
        </button>
      </form>
    </div>
  );
}
