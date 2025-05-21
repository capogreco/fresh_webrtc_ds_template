// No need to import h when using automatic runtime in Fresh
import Controller from "../../islands/Controller.tsx";

// Define mockUser outside the component function to make its reference stable
const STABLE_MOCK_USER = {
  email: "dev@example.com",
  name: "Developer",
  id: "dev-user-id",
};
const CONTROLLER_KEY = "main-controller-island";

// Simple development page that bypasses OAuth
export default function ControllerDevPage() {
  console.log("[ControllerDevPage] function executed");
  return (
    <div>
      <div
        class="dev-warning"
        style="background-color: #fdf6b2; color: #723b13; padding: 12px; border-radius: 4px; margin-bottom: 20px; text-align: center; border: 1px solid #f3cc4a;"
      >
        <strong>Development Mode</strong> - OAuth authentication bypassed
      </div>
      <Controller
        key={CONTROLLER_KEY}
        user={STABLE_MOCK_USER}
        clientId="dev-controller-id"
      />
    </div>
  );
}
