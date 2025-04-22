import Controller from "../../islands/Controller.tsx";

// Simple development page that bypasses OAuth
export default function ControllerDevPage() {
  // Mock user for development
  const mockUser = {
    email: "dev@example.com",
    name: "Developer",
    id: "dev-user-id",
  };

  return (
    <div>
      <div
        class="dev-warning"
        style="background-color: #fdf6b2; color: #723b13; padding: 12px; border-radius: 4px; margin-bottom: 20px; text-align: center; border: 1px solid #f3cc4a;"
      >
        <strong>Development Mode</strong> - OAuth authentication bypassed
      </div>
      <Controller user={mockUser} />
    </div>
  );
}
