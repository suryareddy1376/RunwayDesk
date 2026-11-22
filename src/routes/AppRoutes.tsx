import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import LandingPage from "../pages/LandingPage";
import NotFoundPage from "../pages/NotFoundPage";
import LoginScreen from "../components/LoginScreen";
import { Workspace } from "../components/AppShell";

export default function AppRoutes() {
  const { session, loading } = useAuth();

  if (loading) return <div>Loading...</div>;

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route
        path="/login"
        element={
          session ? <Navigate to="/dashboard" replace /> : <LoginScreen initialMode="signin" />
        }
      />
      <Route
        path="/signup"
        element={
          session ? <Navigate to="/dashboard" replace /> : <LoginScreen initialMode="signup" />
        }
      />
      <Route
        path="/dashboard"
        element={session ? <Workspace /> : <Navigate to="/login" replace />}
      />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
