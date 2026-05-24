import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./store/auth";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Caisse from "./pages/Caisse";
import Catalogue from "./pages/Catalogue";
import Stocks from "./pages/Stocks";
import Rapports from "./pages/Rapports";
import Parametres from "./pages/Parametres";

function PrivateRoute({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const user = useAuthStore((s) => s.user);
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={
          user?.role === "caissier" ? <Navigate to="/caisse" replace /> : <Dashboard />
        } />
        <Route path="caisse" element={<Caisse />} />
        <Route path="catalogue" element={
          <PrivateRoute roles={["admin", "gerant"]}><Catalogue /></PrivateRoute>
        } />
        <Route path="stocks" element={
          <PrivateRoute roles={["admin", "gerant"]}><Stocks /></PrivateRoute>
        } />
        <Route path="rapports" element={
          <PrivateRoute roles={["admin", "gerant"]}><Rapports /></PrivateRoute>
        } />
        <Route path="parametres" element={
          <PrivateRoute roles={["admin"]}><Parametres /></PrivateRoute>
        } />
      </Route>
    </Routes>
  );
}
