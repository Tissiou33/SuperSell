import { useState, useEffect } from "react";
import api from "../lib/api";
import { Plus, Search, Edit2, Trash2, QrCode, X, Save, AlertTriangle } from "lucide-react";
import JsBarcode from "jsbarcode";

interface Article {
  id: number; nom: string; categorie_id: number; categorie_nom: string;
  prix_vente: string; stock_actuel: number; stock_minimum: number;
  code_barre: string; actif: boolean;
}
interface Categorie { id: number; nom: string; rayon: string; }

const EMPTY_FORM = { nom: "", categorieId: "", prixVente: "", stockActuel: "0", stockMinimum: "5" };
const fmt = (n: any) => parseInt(n || 0).toLocaleString("fr-FR");

export default function Catalogue() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [categories, setCategories] = useState<Categorie[]>([]);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [filterAlerte, setFilterAlerte] = useState(false);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"create" | "edit" | "qr" | null>(null);
  const [selected, setSelected] = useState<Article | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [barcodeDataUrl, setBarcodeDataUrl] = useState("");

  const renderBarcodeDataUrl = (code: string) => {
    if (!code) return "";
    const canvas = document.createElement("canvas");
    JsBarcode(canvas, code, {
      format: "EAN13",
      width: 2,
      height: 64,
      displayValue: false,
      margin: 4,
      background: "#ffffff",
      lineColor: "#1a3c5e",
    });
    return canvas.toDataURL("image/png");
  };

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get(`/articles?search=${search}&categorie=${filterCat}${filterAlerte ? "&alerte=1" : ""}`),
      api.get("/utilisateurs/categories"),
    ]).then(([a, c]) => {
      setArticles(a.data);
      setCategories(c.data);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [search, filterCat, filterAlerte]);

  const openCreate = () => {
    setForm({ ...EMPTY_FORM });
    setError("");
    setModal("create");
  };

  const openEdit = (a: Article) => {
    setSelected(a);
    setForm({
      nom: a.nom,
      categorieId: String(a.categorie_id || ""),
      prixVente: a.prix_vente,
      stockActuel: String(a.stock_actuel),
      stockMinimum: String(a.stock_minimum),
    });
    setError("");
    setModal("edit");
  };

  const openQR = async (a: Article) => {
    setSelected(a);
    setBarcodeDataUrl(renderBarcodeDataUrl(a.code_barre || String(a.id)));
    setModal("qr");
  };

  const handleSave = async () => {
    if (!form.nom.trim()) { setError("Le nom est obligatoire"); return; }
    if (!form.prixVente || parseInt(form.prixVente) <= 0) { setError("Le prix de vente est obligatoire"); return; }
    setSaving(true); setError("");
    try {
      const payload = {
        nom: form.nom.trim(),
        categorieId: form.categorieId || null,
        prixVente: parseInt(form.prixVente),
        stockActuel: parseInt(form.stockActuel) || 0,
        stockMinimum: parseInt(form.stockMinimum) || 5,
      };
      if (modal === "create") {
        await api.post("/articles", payload);
      } else {
        await api.put(`/articles/${selected!.id}`, payload);
      }
      setModal(null);
      load();
    } catch (e: any) {
      setError(e.response?.data?.error || "Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (a: Article) => {
    if (!confirm(`Désactiver "${a.nom}" du catalogue ?`)) return;
    try {
      await api.delete(`/articles/${a.id}`);
      load();
    } catch (e: any) {
      setError(e.response?.data?.error || "Impossible de désactiver cet article");
    }
  };

  const downloadBarcode = () => {
    const link = document.createElement("a");
    link.href = barcodeDataUrl;
    link.download = `barcode-${selected?.nom || selected?.id}.png`;
    link.click();
  };

  const printEtiquette = () => {
    const win = window.open("", "_blank");
    if (!win || !selected) return;
    win.document.write(`
      <html><head><title>Étiquette</title>
      <style>
        body { font-family: Arial, sans-serif; text-align:center; padding:10px; }
        .barcode { width:100%; max-width:260px; margin:8px auto 4px; }
        .nom { font-size:12px; font-weight:bold; margin:4px 0; }
        .prix { font-size:16px; font-weight:bold; color:#1a3c5e; }
        .code { font-size:10px; color:#666; }
      </style></head>
      <body>
        <div class="nom">${selected.nom}</div>
        <img class="barcode" src="${barcodeDataUrl}" />
        <div class="prix">${fmt(selected.prix_vente)} FCFA</div>
        <div class="code">${selected.code_barre || ""}</div>
        <script>window.onload=()=>{window.print();window.close();}<\/script>
      </body></html>
    `);
    win.document.close();
  };

  const f = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));
  const nbAlertes = articles.filter(a => a.stock_actuel <= a.stock_minimum).length;

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Catalogue Articles</h1>
          {nbAlertes > 0 && (
            <p className="text-sm text-yellow-600 flex items-center gap-1 mt-0.5">
              <AlertTriangle size={13} /> {nbAlertes} article{nbAlertes > 1 ? "s" : ""} en alerte de stock
            </p>
          )}
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Nouvel article
        </button>
      </div>

      {/* Filtres */}
      <div className="card flex flex-wrap gap-3 items-center py-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
          <input className="input pl-9 text-sm" placeholder="Rechercher par nom ou code-barres..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input w-44 text-sm" value={filterCat}
          onChange={e => setFilterCat(e.target.value)}>
          <option value="">Toutes catégories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
        </select>
        <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600 whitespace-nowrap">
          <input type="checkbox" checked={filterAlerte}
            onChange={e => setFilterAlerte(e.target.checked)} className="w-4 h-4 accent-yellow-500" />
          <AlertTriangle size={13} className="text-yellow-500" /> Alertes uniquement
        </label>
        <span className="text-xs text-gray-400 whitespace-nowrap">{articles.length} article{articles.length > 1 ? "s" : ""}</span>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {loading
          ? <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-primary" />
            </div>
          : articles.length === 0
          ? <p className="text-center text-gray-400 py-16">
              {search || filterCat || filterAlerte ? "Aucun article ne correspond aux filtres" : "Aucun article dans le catalogue"}
            </p>
          : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {["Article", "Catégorie", "Prix vente", "Stock", "Statut", ""].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {articles.map(a => {
                  const enAlerte = a.stock_actuel <= a.stock_minimum;
                  const rupture = a.stock_actuel === 0;
                  return (
                    <tr key={a.id} className={`hover:bg-gray-50 transition-colors ${rupture ? "bg-red-50/40" : ""}`}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800">{a.nom}</p>
                        <p className="text-xs text-gray-400 font-mono">{a.code_barre || "—"}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{a.categorie_nom || "—"}</td>
                      <td className="px-4 py-3">
                        <span className="font-bold text-primary">{fmt(a.prix_vente)}</span>
                        <span className="text-xs text-gray-400"> FCFA</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-bold text-base ${rupture ? "text-red-600" : enAlerte ? "text-yellow-600" : "text-gray-700"}`}>
                          {a.stock_actuel}
                        </span>
                        <span className="text-xs text-gray-300 ml-1">/ min {a.stock_minimum}</span>
                      </td>
                      <td className="px-4 py-3">
                        {rupture ? <span className="badge-danger">Rupture</span>
                          : enAlerte ? <span className="badge-warning">⚠ Alerte</span>
                          : <span className="badge-success">✓ OK</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-0.5">
                          <button onClick={() => openQR(a)} title="Voir QR / Code-barres"
                            className="p-1.5 rounded-lg hover:bg-primary/10 text-gray-400 hover:text-primary transition-colors">
                            <QrCode size={15} />
                          </button>
                          <button onClick={() => openEdit(a)} title="Modifier"
                            className="p-1.5 rounded-lg hover:bg-primary/10 text-gray-400 hover:text-primary transition-colors">
                            <Edit2 size={15} />
                          </button>
                          <button onClick={() => handleDelete(a)} title="Désactiver"
                            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
      </div>

      {/* ─── Modal Création / Édition ─────────────────────────────────── */}
      {(modal === "create" || modal === "edit") && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-800">
                {modal === "create" ? "➕ Nouvel article" : `✏️ Modifier — ${selected?.nom}`}
              </h2>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Nom */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">
                  Nom de l'article <span className="text-red-400">*</span>
                </label>
                <input className="input" autoFocus value={form.nom}
                  onChange={e => f("nom", e.target.value)}
                  placeholder="Ex: Riz local 1kg" />
              </div>

              {/* Catégorie */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Catégorie</label>
                <select className="input" value={form.categorieId} onChange={e => f("categorieId", e.target.value)}>
                  <option value="">— Sans catégorie —</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.nom} ({c.rayon})</option>)}
                </select>
              </div>

              {/* Prix */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">
                  Prix de vente (FCFA) <span className="text-red-400">*</span>
                </label>
                <input className="input text-lg font-bold" type="number" min="0"
                  value={form.prixVente} onChange={e => f("prixVente", e.target.value)}
                  placeholder="0" />
              </div>

              {/* Stock */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">
                    {modal === "create" ? "Stock initial" : "Quantité en stock"}
                  </label>
                  <input className="input" type="number" min="0"
                    value={form.stockActuel} onChange={e => f("stockActuel", e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">
                    Stock minimum <span className="text-gray-400">(alerte)</span>
                  </label>
                  <input className="input" type="number" min="0"
                    value={form.stockMinimum} onChange={e => f("stockMinimum", e.target.value)} />
                </div>
              </div>

              {modal === "create" && (
                <p className="text-xs text-gray-400 bg-gray-50 px-3 py-2 rounded-lg">
                  💡 Le code-barres unique sera généré automatiquement à la création.
                </p>
              )}
            </div>

            {error && (
              <div className="mt-3 flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                <X size={14} /> {error}
              </div>
            )}

            <div className="flex gap-2 mt-5">
              <button onClick={() => setModal(null)} className="btn-ghost flex-1">Annuler</button>
              <button onClick={handleSave} disabled={saving}
                className="btn-primary flex-1 flex items-center justify-center gap-2">
                <Save size={15} />
                {saving ? "Enregistrement…" : modal === "create" ? "Créer l'article" : "Enregistrer les modifications"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal QR / Code-barres ─────────────────────────────────────── */}
      {modal === "qr" && selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6 text-center">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-bold text-gray-800">Code-barres article</h2>
              <button onClick={() => setModal(null)}><X size={18} className="text-gray-400" /></button>
            </div>
            <p className="text-sm font-medium text-primary mb-4">{selected.nom}</p>

            {barcodeDataUrl && (
              <img src={barcodeDataUrl} alt="Code-barres" className="mx-auto w-full max-w-[260px] h-auto mb-2 border border-gray-100 rounded-lg p-2 bg-white" />
            )}
            <p className="text-xs text-gray-500 mb-1">Code-barres EAN-13</p>

            {selected.code_barre && (
              <div className="mt-4 bg-gray-50 rounded-lg p-3">
                <p className="font-mono font-bold text-lg tracking-widest">{selected.code_barre}</p>
              </div>
            )}

            <p className="text-xs text-gray-400 mt-3">{fmt(selected.prix_vente)} FCFA</p>

            <div className="flex gap-2 mt-4">
              <button onClick={downloadBarcode} className="btn-ghost flex-1 text-sm py-2">
                Télécharger
              </button>
              <button onClick={printEtiquette} className="btn-primary flex-1 text-sm py-2">
                🖨️ Imprimer étiquette
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
