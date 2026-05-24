import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/auth";
import api from "../lib/api";
import {
  LayoutDashboard, ShoppingCart, Package,
  BarChart3, Settings, LogOut, AlertTriangle, Store
} from "lucide-react";
import { useState, useEffect } from "react";

export default function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [alertes, setAlertes] = useState(0);

  useEffect(() => {
    if (user?.role !== "caissier") {
      api.get("/stocks/alertes").then(r => setAlertes(r.data.length)).catch(() => {});
      // Rafraîchir les alertes toutes les 60s
      const t = setInterval(() => {
        api.get("/stocks/alertes").then(r => setAlertes(r.data.length)).catch(() => {});
      }, 60_000);
      return () => clearInterval(t);
    }
  }, [user]);

  const handleLogout = async () => {
    try { await api.post("/auth/logout"); } catch { /* ignore */ }
    logout();
    navigate("/login", { replace: true });
  };

  // Navigation selon le rôle
  const navItems = [
    // Dashboard — visible pour gérant et admin uniquement
    ...(user?.role !== "caissier" ? [
      { to: "/", icon: LayoutDashboard, label: "Tableau de bord", end: true }
    ] : []),
    // Caisse — visible pour TOUS les rôles
    { to: "/caisse", icon: ShoppingCart, label: "Caisse", end: false },
    // Modules gérant/admin
    ...(user?.role !== "caissier" ? [
      { to: "/catalogue", icon: Package, label: "Catalogue", end: false },
      { to: "/stocks",    icon: Store,   label: "Stocks",    end: false },
      { to: "/rapports",  icon: BarChart3, label: "Rapports", end: false },
    ] : []),
    // Paramètres — admin uniquement
    ...(user?.role === "admin" ? [
      { to: "/parametres", icon: Settings, label: "Paramètres", end: false }
    ] : []),
  ];

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* ─── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="w-56 bg-primary flex flex-col shrink-0">
        {/* Logo */}
        <div className="p-4 border-b border-white/10">
          <h1 className="text-white text-xl font-black tracking-tight">Supermarché étoile du golfe</h1>
          <p className="text-blue-200 text-xs mt-0.5 truncate">{user?.nom}</p>
          <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-medium
            ${user?.role === "admin" ? "bg-red-500/30 text-red-200"
              : user?.role === "gerant" ? "bg-yellow-500/30 text-yellow-200"
              : "bg-green-500/30 text-green-200"}`}>
            {user?.role === "admin" ? "Administrateur"
              : user?.role === "gerant" ? "Gérant"
              : "Caissier"}
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-0.5">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? "bg-white/20 text-white shadow-sm"
                    : "text-blue-100/80 hover:bg-white/10 hover:text-white"
                }`
              }>
              <item.icon size={18} className="shrink-0" />
              <span className="flex-1">{item.label}</span>
              {item.label === "Stocks" && alertes > 0 && (
                <span className="bg-yellow-400 text-yellow-900 text-xs font-bold rounded-full px-1.5 py-0.5 min-w-5 text-center">
                  {alertes}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Alerte stock */}
        {alertes > 0 && user?.role !== "caissier" && (
          <div className="mx-3 mb-2 p-2.5 bg-yellow-500/15 rounded-lg border border-yellow-400/20">
            <div className="flex items-center gap-2 text-yellow-300 text-xs">
              <AlertTriangle size={13} className="shrink-0" />
              <span>{alertes} article{alertes > 1 ? "s" : ""} en alerte</span>
            </div>
          </div>
        )}

        {/* Déconnexion */}
        <button
          onClick={handleLogout}
          className="m-3 mt-0 flex items-center gap-3 px-3 py-2.5 rounded-lg text-blue-100/70 hover:bg-white/10 hover:text-white text-sm transition-all">
          <LogOut size={17} />
          <span>Déconnexion</span>
        </button>
      </aside>

      {/* ─── Contenu principal ────────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
