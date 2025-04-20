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
      <div class="dev-warning">
        <strong>Development Mode</strong> - OAuth authentication bypassed
      </div>
      <Controller user={mockUser} />
    </div>
  );
}