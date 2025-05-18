// Preact component
import { useSignal } from "@preact/signals";

interface AddClientFormProps {
  onAddClient: (clientId: string) => void;
  disabled?: boolean;
}

export function AddClientForm({
  onAddClient,
  disabled = false,
}: AddClientFormProps) {
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
