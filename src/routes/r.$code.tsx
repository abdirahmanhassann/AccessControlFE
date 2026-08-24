import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/r/$code")({
  component: QrRedirect,
});

function QrRedirect() {
  const { code } = Route.useParams();
  return <Navigate to="/worker" search={{ qr: code }} />;
}
