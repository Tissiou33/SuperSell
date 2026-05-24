import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/auth";
import api from "../lib/api";
import { LogIn, Eye, EyeOff } from "lucide-react";

export default function Login() {
  const [form, setForm] = useState({ identifiant: "", motDePasse: "" });
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const r = await api.post("/auth/login", form);
      setAuth(r.data.user, r.data.token);
      navigate(r.data.user.role === "caissier" ? "/caisse" : "/");
    } catch (err: any) {
      setError(err.response?.data?.error || "Erreur de connexion");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary to-primary-light flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary">Supermarché étoile du golfe</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Identifiant</label>
            <input className="input" type="text" value={form.identifiant} autoFocus
              onChange={e => setForm(f => ({ ...f, identifiant: e.target.value }))}
              placeholder="Votre identifiant" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
            <div className="relative">
              <input className="input pr-10" type={showPwd ? "text" : "password"}
                value={form.motDePasse}
                onChange={e => setForm(f => ({ ...f, motDePasse: e.target.value }))}
                placeholder="Votre mot de passe" required />
              <button type="button" onClick={() => setShowPwd(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 py-3">
            <LogIn size={18} />
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          Supermarché étoile du golfe v1.0 — Phase MVP
        </p>
      </div>
    </div>
  );
}
