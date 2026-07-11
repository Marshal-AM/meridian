import { Alert } from "./Alert";

export function PageFeedback({
  success,
  error,
}: {
  success?: string;
  error?: string;
}) {
  return (
    <>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      {success ? <Alert variant="success">{success}</Alert> : null}
    </>
  );
}
