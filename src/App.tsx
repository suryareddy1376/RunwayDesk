import { AuthProvider } from './context/AuthContext';
import AppShell from './components/AppShell';

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
