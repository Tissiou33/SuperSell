import { useState, useEffect } from "react";
import api from "../lib/api";
import { Plus, AlertTriangle, TrendingUp, TrendingDown, RefreshCw, X, Save, History } from "lucide-react";

interface Article { id: number; nom: string; stock_actuel: number; stock_minimum: number; unite: string; categorie_nom: string; }
interface Mouvement { id: number; article_nom: string; type: string; quantite: number; motif: string; user_nom: string; fournisseur_nom: string; created_at: string; }
interface Fournisseur { id: number; nom: string; }

const typeColor: Record<string, string> = {
  entree: "badge-success", sortie: "badge-danger", ajustement: "badge-warning"
};
const typeLabel: Record<string, string> = {
  entree: "Entrée ↑", sortie: "Sortie ↓", ajustement: "Ajustement ⟳"
};

export default function Stocks() {
  const [tab, setTab] = useState<"alertes" | "entree" | "historique" | "ajustement">("alertes");
  const [alertes, setAlertes] = useState<Article[]>([]);
  const [mouvements, setMouvements] = useState<Mouvement[]>([]);
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(false);

  // Entrée stock form
  const [entreeForm, setEntreeForm] = useState({ articleId: "", quantite: "", fournisseurId: "", prixAchat: "", motif: "Réapprovisionnement" });
  // Ajustement form
  const [ajustForm, setAjustForm] = useState({ articleId: "", newStock: "", motif: "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ type: "", text: "" });

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get("/stocks/alertes"),
      api.get("/stocks/mouvements"),
      api.get("/utilisateurs/fournisseurs"),
      api.get("/articles"),
    ]).then(([al, mv, f, art]) => {
      setAlertes(al.data);
      setMouvements(mv.data);
      setFournisseurs(f.data);
      setArticles(art.data);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleEntree = async () => {
    if (!entreeForm.articleId || !entreeForm.quantite) { setMsg({ type: "err", text: "Article et quantité requis" }); return; }
    setSaving(true); setMsg({ type: "", text: "" });
    try {
      await api.post("/stocks/entree", {
        articleId: parseInt(entreeForm.articleId),
        quantite: parseInt(entreeForm.quantite),
        fournisseurId: entreeForm.fournisseurId || null,
        prixAchat: entreeForm.prixAchat || null,
        motif: entreeForm.motif,
      });
      setMsg({ type: "ok", text: "Entrée de stock enregistrée ✓" });
      setEntreeForm({ articleId: "", quantite: "", fournisseurId: "", prixAchat: "", motif: "Réapprovisionnement" });
      load();
    } catch (e: any) {
      setMsg({ type: "err", text: e.response?.data?.error || "Erreur" });
    } finally {
      setSaving(false);
    }
  };

  const handleAjust = async () => {
    if (!ajustForm.articleId || ajustForm.newStock === "") { setMsg({ type: "err", text: "Article et stock requis" }); return; }
    if (!ajustForm.motif) { setMsg({ type: "err", text: "Motif obligatoire pour un ajustement" }); return; }
    setSaving(true); setMsg({ type: "", text: "" });
    try {
      await api.post("/stocks/ajustement", {
        articleId: parseInt(ajustForm.articleId),
        newStock: parseInt(ajustForm.newStock),
        motif: ajustForm.motif,
      });
      setMsg({ type: "ok", text: "Ajustement effectué ✓" });
      setAjustForm({ articleId: "", newStock: "", motif: "" });
      load();
    } catch (e: any) {
      setMsg({ type: "err", text: e.response?.data?.error || "Erreur" });
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: "alertes", label: `Alertes (${alertes.length})`, icon: AlertTriangle },
    { id: "entree", label: "Réappro.", icon: TrendingUp },
    { id: "ajustement", label: "Ajustement", icon: RefreshCw },
    { id: "historique", label: "Historique", icon: History },
  ] as const;

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold text-gray-800">Gestion des Stocks</h1>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card text-center">
          <p className="text-3xl font-bold text-red-500">{alertes.filter(a => a.stock_actuel === 0).length}</p>
          <p className="text-sm text-gray-500 mt-1">En rupture</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-yellow-500">{alertes.length}</p>
          <p className="text-sm text-gray-500 mt-1">Articles en alerte</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-primary">{articles.length}</p>
          <p className="text-sm text-gray-500 mt-1">Articles actifs</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {tabs.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setMsg({ type: "", text: "" }); }}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.id ? "border-primary text-primary" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}>
            <t.icon size={15} />{t.label}
          </button>
        ))}
      </div>

      {msg.text && (
        <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${msg.type === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {msg.text}
          <button onClick={() => setMsg({ type: "", text: "" })} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* Alertes tab */}
      {tab === "alertes" && (
        <div className="card p-0 overflow-hidden">
          {loading ? <div className="py-12 text-center text-gray-400">Chargement…</div>
            : alertes.length === 0
            ? <div className="py-12 text-center text-gray-400">✓ Tous les stocks sont au-dessus du minimum</div>
            : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {["Article", "Catégorie", "Stock actuel", "Stock minimum", "Statut"].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {alertes.map(a => (
                    <tr key={a.id} className={a.stock_actuel === 0 ? "bg-red-50" : "hover:bg-gray-50"}>
                      <td className="px-4 py-3 font-medium">{a.nom}</td>
                      <td className="px-4 py-3 text-gray-500">{a.categorie_nom}</td>
                      <td className="px-4 py-3 font-bold text-red-600">{a.stock_actuel} {a.unite}</td>
                      <td className="px-4 py-3 text-gray-500">{a.stock_minimum}</td>
                      <td className="px-4 py-3">
                        {a.stock_actuel === 0
                          ? <span className="badge-danger">Rupture totale</span>
                          : <span className="badge-warning">⚠ Alerte</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      )}

      {/* Entrée stock tab */}
      {tab === "entree" && (
        <div className="card max-w-lg">
          <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <TrendingUp size={18} className="text-green-500" /> Réapprovisionnement — Entrée de stock
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Article *</label>
              <select className="input" value={entreeForm.articleId}
                onChange={e => setEntreeForm(p => ({ ...p, articleId: e.target.value }))}>
                <option value="">— Sélectionner —</option>
                {articles.map(a => (
                  <option key={a.id} value={a.id}>{a.nom} (stock: {a.stock_actuel})</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Quantité *</label>
                <input className="input" type="number" min="1" value={entreeForm.quantite}
                  onChange={e => setEntreeForm(p => ({ ...p, quantite: e.target.value }))} placeholder="0" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Prix achat (FCFA)</label>
                <input className="input" type="number" value={entreeForm.prixAchat}
                  onChange={e => setEntreeForm(p => ({ ...p, prixAchat: e.target.value }))} placeholder="Optionnel" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Fournisseur</label>
              <select className="input" value={entreeForm.fournisseurId}
                onChange={e => setEntreeForm(p => ({ ...p, fournisseurId: e.target.value }))}>
                <option value="">— Aucun —</option>
                {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Motif</label>
              <input className="input" value={entreeForm.motif}
                onChange={e => setEntreeForm(p => ({ ...p, motif: e.target.value }))} placeholder="Réapprovisionnement" />
            </div>
            <button onClick={handleEntree} disabled={saving} className="btn-primary w-full flex items-center justify-center gap-2">
              <Plus size={16} /> {saving ? "Enregistrement…" : "Valider l'entrée de stock"}
            </button>
          </div>
        </div>
      )}

      {/* Ajustement tab */}
      {tab === "ajustement" && (
        <div className="card max-w-lg">
          <h2 className="font-semibold text-gray-700 mb-1 flex items-center gap-2">
            <RefreshCw size={18} className="text-orange-500" /> Ajustement manuel de stock
          </h2>
          <p className="text-xs text-gray-400 mb-4">Correction après inventaire physique. Action tracée dans l'audit.</p>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Article *</label>
              <select className="input" value={ajustForm.articleId}
                onChange={e => setAjustForm(p => ({ ...p, articleId: e.target.value }))}>
                <option value="">— Sélectionner —</option>
                {articles.map(a => <option key={a.id} value={a.id}>{a.nom} (actuel: {a.stock_actuel})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Nouveau stock réel *</label>
              <input className="input" type="number" min="0" value={ajustForm.newStock}
                onChange={e => setAjustForm(p => ({ ...p, newStock: e.target.value }))} placeholder="Quantité comptée physiquement" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Motif obligatoire *</label>
              <input className="input" value={ajustForm.motif}
                onChange={e => setAjustForm(p => ({ ...p, motif: e.target.value }))} placeholder="Ex: Inventaire du 18/05/2026, casse..." />
            </div>
            <button onClick={handleAjust} disabled={saving} className="btn-primary w-full flex items-center justify-center gap-2">
              <Save size={16} /> {saving ? "Enregistrement…" : "Valider l'ajustement"}
            </button>
          </div>
        </div>
      )}

      {/* Historique tab */}
      {tab === "historique" && (
        <div className="card p-0 overflow-hidden">
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="font-semibold">Historique des mouvements</h2>
            <button onClick={load} className="btn-ghost flex items-center gap-2 text-sm py-1.5">
              <RefreshCw size={14} /> Actualiser
            </button>
          </div>
          {loading ? <div className="py-12 text-center text-gray-400">Chargement…</div>
            : mouvements.length === 0
            ? <div className="py-12 text-center text-gray-400">Aucun mouvement enregistré</div>
            : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {["Date", "Article", "Type", "Qté", "Motif", "Opérateur"].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {mouvements.map(m => (
                    <tr key={m.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-400 text-xs whitespace-nowrap">
                        {new Date(m.created_at).toLocaleString("fr-FR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" })}
                      </td>
                      <td className="px-4 py-2.5 font-medium">{m.article_nom}</td>
                      <td className="px-4 py-2.5"><span className={typeColor[m.type]}>{typeLabel[m.type]}</span></td>
                      <td className="px-4 py-2.5 font-bold">{m.type === "sortie" ? "-" : "+"}{m.quantite}</td>
                      <td className="px-4 py-2.5 text-gray-500 max-w-xs truncate">{m.motif || "—"}</td>
                      <td className="px-4 py-2.5 text-gray-400">{m.user_nom || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      )}
    </div>
  );
}
