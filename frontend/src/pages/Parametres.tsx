import { useState, useEffect } from "react";
import api from "../lib/api";
import { Users, Settings, Plus, Edit2, X, Save, Key, Check } from "lucide-react";

interface Utilisateur { id: number; nom: string; identifiant: string; role: string; actif: boolean; }
interface Config { [key: string]: string; }

const ROLES = ["admin", "gerant", "caissier"];
const ROLE_LABELS: Record<string, string> = { admin: "Administrateur", gerant: "Gérant", caissier: "Caissier" };
const EMPTY_USER = { nom: "", identifiant: "", motDePasse: "", role: "caissier" };

export default function Parametres() {
  const [tab, setTab] = useState<"users" | "config">("users");
  const [users, setUsers] = useState<Utilisateur[]>([]);
  const [config, setConfig] = useState<Config>({});
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [selected, setSelected] = useState<Utilisateur | null>(null);
  const [form, setForm] = useState({ ...EMPTY_USER });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ type: "", text: "" });

  const load = () => {
    api.get("/utilisateurs").then(r => setUsers(r.data));
    api.get("/utilisateurs/config").then(r => setConfig(r.data)).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setForm({ ...EMPTY_USER }); setModal("create"); setMsg({ type:"", text:"" }); };
  const openEdit = (u: Utilisateur) => {
    setSelected(u);
    setForm({ nom: u.nom, identifiant: u.identifiant, motDePasse: "", role: u.role });
    setModal("edit");
    setMsg({ type:"", text:"" });
  };

  const handleSaveUser = async () => {
    if (!form.nom || !form.identifiant) { setMsg({ type:"err", text:"Nom et identifiant requis" }); return; }
    if (modal === "create" && !form.motDePasse) { setMsg({ type:"err", text:"Mot de passe requis" }); return; }
    setSaving(true); setMsg({ type:"", text:"" });
    try {
      if (modal === "create") {
        await api.post("/utilisateurs", form);
        setMsg({ type:"ok", text:"Utilisateur créé ✓" });
      } else {
        await api.put(`/utilisateurs/${selected!.id}`, { ...form, actif: selected!.actif });
        setMsg({ type:"ok", text:"Utilisateur mis à jour ✓" });
      }
      setModal(null);
      load();
    } catch (e: any) {
      setMsg({ type:"err", text: e.response?.data?.error || "Erreur" });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActif = async (u: Utilisateur) => {
    if (!confirm(`${u.actif ? "Désactiver" : "Activer"} ${u.nom} ?`)) return;
    await api.put(`/utilisateurs/${u.id}`, {
      nom: u.nom, identifiant: u.identifiant, role: u.role, actif: !u.actif
    });
    load();
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      await api.put("/utilisateurs/config", config);
      setMsg({ type:"ok", text:"Configuration sauvegardée ✓" });
    } catch {
      setMsg({ type:"err", text:"Erreur lors de la sauvegarde" });
    } finally {
      setSaving(false);
    }
  };

  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const tabs = [
    { id: "users", label: "Utilisateurs", icon: Users },
    { id: "config", label: "Configuration", icon: Settings },
  ] as const;

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold text-gray-800">Paramètres</h1>

      <div className="flex gap-2 border-b border-gray-200">
        {tabs.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setMsg({ type:"", text:"" }); }}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id ? "border-primary text-primary" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {msg.text && (
        <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${msg.type === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {msg.text} <button onClick={() => setMsg({ type:"", text:"" })} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* Users tab */}
      {tab === "users" && (
        <>
          <div className="flex justify-end">
            <button onClick={openCreate} className="btn-primary flex items-center gap-2">
              <Plus size={16} /> Nouvel utilisateur
            </button>
          </div>
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {["Nom", "Identifiant", "Rôle", "Statut", "Actions"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{u.nom}</td>
                    <td className="px-4 py-3 font-mono text-gray-500">{u.identifiant}</td>
                    <td className="px-4 py-3">
                      <span className={`badge-${u.role === "admin" ? "danger" : u.role === "gerant" ? "warning" : "success"}`}>
                        {ROLE_LABELS[u.role]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {u.actif ? <span className="badge-success">Actif</span> : <span className="badge-danger">Inactif</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(u)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-primary">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => handleToggleActif(u)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-orange-500">
                          {u.actif ? <X size={14} /> : <Check size={14} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Config tab */}
      {tab === "config" && (
        <div className="card max-w-xl">
          <h2 className="font-semibold text-gray-700 mb-5">Configuration générale</h2>
          <div className="space-y-4">
            {[
              { key: "nom_magasin", label: "Nom du magasin", type: "text", placeholder: "Supermarché étoile du golfe" },
              { key: "devise", label: "Devise", type: "text", placeholder: "FCFA" },
              { key: "tva_taux", label: "Taux TVA (%)", type: "number", placeholder: "18" },
              { key: "stock_alerte_actif", label: "Alertes de stock", type: "select" },
            ].map(field => (
              <div key={field.key}>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{field.label}</label>
                {field.type === "select"
                  ? <select className="input" value={config[field.key] || "true"}
                      onChange={e => setConfig(c => ({ ...c, [field.key]: e.target.value }))}>
                      <option value="true">Activé</option>
                      <option value="false">Désactivé</option>
                    </select>
                  : <input className="input" type={field.type} placeholder={field.placeholder}
                      value={config[field.key] || ""}
                      onChange={e => setConfig(c => ({ ...c, [field.key]: e.target.value }))} />}
              </div>
            ))}

            <div className="pt-2">
              <button onClick={handleSaveConfig} disabled={saving} className="btn-primary flex items-center gap-2">
                <Save size={15} /> {saving ? "Sauvegarde…" : "Enregistrer la configuration"}
              </button>
            </div>
          </div>

          <div className="mt-6 pt-5 border-t">
            <h3 className="font-semibold text-gray-600 mb-3 flex items-center gap-2"><Key size={15}/> Comptes de démonstration</h3>
            <div className="space-y-1 text-sm text-gray-500 font-mono bg-gray-50 rounded-lg p-3">
              <p>admin / admin123 → Administrateur</p>
              <p>gerant / gerant123 → Gérant</p>
              <p>marie / caissier123 → Caissière</p>
            </div>
            <p className="text-xs text-gray-400 mt-2">⚠ Changez ces mots de passe avant la mise en production.</p>
          </div>
        </div>
      )}

      {/* User modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-lg">{modal === "create" ? "Nouvel utilisateur" : "Modifier l'utilisateur"}</h2>
              <button onClick={() => setModal(null)}><X size={20} className="text-gray-400" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Nom complet *</label>
                <input className="input" value={form.nom} onChange={e => f("nom", e.target.value)} placeholder="Prénom Nom" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Identifiant *</label>
                <input className="input font-mono" value={form.identifiant} onChange={e => f("identifiant", e.target.value.toLowerCase().replace(/\s/g,""))} placeholder="identifiant" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                  Mot de passe {modal === "edit" ? "(laisser vide = inchangé)" : "*"}
                </label>
                <input className="input" type="password" value={form.motDePasse} onChange={e => f("motDePasse", e.target.value)} placeholder="••••••••" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Rôle *</label>
                <select className="input" value={form.role} onChange={e => f("role", e.target.value)}>
                  {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
              </div>
            </div>
            {msg.text && <p className={`mt-3 text-sm p-2 rounded ${msg.type==="err" ? "bg-red-50 text-red-600" : "bg-green-50 text-green-700"}`}>{msg.text}</p>}
            <div className="flex gap-2 mt-5">
              <button onClick={() => setModal(null)} className="btn-ghost flex-1">Annuler</button>
              <button onClick={handleSaveUser} disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                <Save size={15}/> {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
