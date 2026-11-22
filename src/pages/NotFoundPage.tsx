import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <main>
      <h1>This page is not here</h1>
      <p>The link may be old, or the page may have moved.</p>
      <Link to="/">Back to RunwayDesk</Link>
    </main>
  );
}
