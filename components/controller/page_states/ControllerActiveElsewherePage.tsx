// Preact component
import { h } from "preact";
import KickControllerButton from "../../../islands/KickControllerButton.tsx";

export interface User {
  id: string;
  name: string;
  email: string;
}

interface ControllerActiveElsewherePageProps {
  user: User;
  clientId: string;
  activeControllerClientId: string;
}

export default function ControllerActiveElsewherePage({
  user,
  clientId,
  activeControllerClientId,
}: ControllerActiveElsewherePageProps) {
  return (
    <div class="container">
      <h1>Controller Already Active</h1>
      <p>
        Another controller client is already active.
      </p>
      <div style="margin-top: 20px;">
        <KickControllerButton
          user={user}
          clientId={clientId}
          activeControllerClientId={activeControllerClientId}
        />
      </div>
    </div>
  );
}
