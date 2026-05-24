import { useState, useEffect, useRef, useCallback } from "react";
import api from "../lib/api";
import { useAuthStore } from "../store/auth";
import {
  Scan, Search, Trash2, Plus, Minus, CreditCard,
  Smartphone, Banknote, X, CheckCircle, AlertCircle, Printer
} from "lucide-react";

interface Article {
  id: number; nom: string; prix_vente: string;
  stock_actuel: number; code_barre: string; categorie_nom: string;
}
interface Ligne { article: Article; quantite: number; }
interface VenteReceipt {
  vente: {
    id: number; total_ttc: string; mode_paiement: string;
    montant_recu: string; rendu_monnaie: string; created_at: string;
    caissier_nom: string;
  };
  lignes: Array<{ id: number; article_nom: string; quantite: number; prix_unitaire: string; sous_total: string; }>;
}

const MODES = [
  { id: "especes",  label: "Espèces", icon: Banknote },
  { id: "momo",    label: "Yas money",    icon: Smartphone },
  { id: "flooz",   label: "Flooz",   icon: Smartphone },
  { id: "carte",   label: "Carte",   icon: CreditCard },
];
const QUICK_AMOUNTS = [500, 1000, 2000, 5000, 10000, 20000];
const fmt = (n: any) => parseInt(n || 0).toLocaleString("fr-FR");

const AZERTY_SYMBOL_TO_DIGIT: Record<string, string> = {
  "&": "1",
  "é": "2",
  '"': "3",
  "'": "4",
  "(": "5",
  "-": "6",
  "è": "7",
  "_": "8",
  "ç": "9",
  "à": "0",
};

function normalizeScanCode(raw: string): string {
  return raw
    .trim()
    .split("")
    .map((ch) => AZERTY_SYMBOL_TO_DIGIT[ch] ?? ch)
    .join("")
    .replace(/\s+/g, "");
}

export default function Caisse() {
  const { user } = useAuthStore();
  const [panier, setPanier] = useState<Ligne[]>([]);
  const [scanInput, setScanInput] = useState("");
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Article[]>([]);
  const [mode, setMode] = useState("especes");
  const [montantRecu, setMontantRecu] = useState("");
  const [loading, setLoading] = useState(false);
  const [receipt, setReceipt] = useState<VenteReceipt | null>(null);
  const [error, setError] = useState("");
  const scanRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const total = panier.reduce((s, l) => s + parseInt(l.article.prix_vente) * l.quantite, 0);
  const rendu = mode === "especes" && montantRecu ? Math.max(0, parseInt(montantRecu) - total) : 0;
  const montantOk = mode !== "especes" || (!!montantRecu && parseInt(montantRecu) >= total);

  // Focus scan on mount and after each action
  useEffect(() => { scanRef.current?.focus(); }, []);

  // ─── Ajouter au panier ──────────────────────────────────────────────────
  const addToCart = useCallback((article: Article, qty = 1) => {
    if (article.stock_actuel <= 0) {
      setError(`"${article.nom}" est en rupture de stock`);
      return;
    }
    setPanier(prev => {
      const existing = prev.find(l => l.article.id === article.id);
      if (existing) {
        const newQty = existing.quantite + qty;
        if (newQty > article.stock_actuel) {
          setError(`Stock insuffisant pour "${article.nom}" (max: ${article.stock_actuel})`);
          return prev;
        }
        return prev.map(l => l.article.id === article.id ? { ...l, quantite: newQty } : l);
      }
      return [...prev, { article, quantite: qty }];
    });
    setSearchResults([]);
    setSearch("");
    setScanInput("");
    setTimeout(() => scanRef.current?.focus(), 50);
  }, []);

  // ─── Scan clavier (USB HID) ─────────────────────────────────────────────
  const handleScan = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || !scanInput.trim()) return;
    const rawCode = scanInput.trim();
    const normalizedCode = normalizeScanCode(rawCode);
    setScanInput("");
    setError("");

    if (!normalizedCode) return;

    try {
      let r;
      try {
        r = await api.get(`/articles/scan/${encodeURIComponent(normalizedCode)}`);
      } catch {
        if (normalizedCode !== rawCode) {
          r = await api.get(`/articles/scan/${encodeURIComponent(rawCode)}`);
        } else {
          throw new Error("scan_not_found");
        }
      }
      addToCart(r.data);
    } catch {
      setError(
        normalizedCode !== rawCode
          ? `Code non reconnu : "${rawCode}" (interprété: "${normalizedCode}") — Essayez la recherche manuelle`
          : `Code non reconnu : "${rawCode}" — Essayez la recherche manuelle`
      );
    }
  };

  // ─── Recherche manuelle ─────────────────────────────────────────────────
  useEffect(() => {
    if (!search.trim()) { setSearchResults([]); return; }
    const t = setTimeout(() => {
      api.get(`/articles?search=${encodeURIComponent(search)}`)
        .then(r => setSearchResults(r.data.slice(0, 8)))
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  // ─── Modifier quantité ──────────────────────────────────────────────────
  const updateQty = (id: number, delta: number) => {
    setError("");
    setPanier(prev =>
      prev
        .map(l => l.article.id === id ? { ...l, quantite: l.quantite + delta } : l)
        .filter(l => l.quantite > 0)
    );
  };

  // ─── Valider la vente ───────────────────────────────────────────────────
  const handleValider = async () => {
    if (!panier.length) return;
    if (!montantOk) { setError("Le montant reçu est insuffisant"); return; }
    setLoading(true);
    setError("");
    try {
      const r = await api.post("/ventes", {
        lignes: panier.map(l => ({ articleId: l.article.id, quantite: l.quantite })),
        modePaiement: mode,
        montantRecu: montantRecu ? parseInt(montantRecu) : null,
      });
      setReceipt(r.data);
      setPanier([]);
      setMontantRecu("");
    } catch (err: any) {
      setError(err.response?.data?.error || "Erreur lors de la validation de la vente");
    } finally {
      setLoading(false);
    }
  };

  // ─── Imprimer le reçu ───────────────────────────────────────────────────
  const printReceipt = () => {
    if (!receipt) return;
    setError("");
    const win = window.open("", "_blank", "width=400,height=700");
    if (!win) {
      setError("Impression bloquée: autorisez les popups pour ce site, puis réessayez.");
      return;
    }

    const paiementLabel =
      receipt.vente.mode_paiement === "momo"
        ? "YAS MONEY"
        : receipt.vente.mode_paiement.toUpperCase();

    const date = new Date(receipt.vente.created_at).toLocaleString("fr-FR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
    const lignesHtml = receipt.lignes.map(l => `
      <tr>
        <td style="padding:3px 0">${l.article_nom}</td>
        <td style="text-align:center;padding:3px 4px">x${l.quantite}</td>
        <td style="text-align:right;padding:3px 0">${fmt(l.sous_total)}</td>
      </tr>
    `).join("");

    win.document.write(`
      <!DOCTYPE html><html><head>
      <meta charset="UTF-8">
      <title>Reçu #${receipt.vente.id}</title>
      <style>
        @page { size: 80mm auto; margin: 4mm; }
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family:'Courier New',monospace; font-size:12px; width:72mm; padding:2mm; }
        .center { text-align:center; }
        .bold { font-weight:bold; }
        .logo { font-size:22px; font-weight:900; letter-spacing:2px; color:#1a3c5e; }
        .sep { border:none; border-top:1px dashed #999; margin:8px 0; }
        table { width:100%; border-collapse:collapse; }
        .total-row td { font-size:15px; font-weight:bold; padding:6px 0; border-top:1px solid #333; }
        .footer { font-size:10px; color:#666; margin-top:8px; text-align:center; }
      </style>
      </head><body>
      <div class="center">
        <div class="logo">Supermarché étoile du golfe</div>
      </div>
      <hr class="sep">
      <div class="center" style="font-size:10px;color:#555">
        <div>Reçu N° ${String(receipt.vente.id).padStart(6,"0")}</div>
        <div>${date}</div>
        <div>Caissier : ${receipt.vente.caissier_nom || user?.nom || "—"}</div>
      </div>
      <hr class="sep">
      <table>
        <thead>
          <tr style="font-size:10px;color:#666">
            <th style="text-align:left">Article</th>
            <th style="text-align:center">Qté</th>
            <th style="text-align:right">Montant</th>
          </tr>
        </thead>
        <tbody>${lignesHtml}</tbody>
      </table>
      <hr class="sep">
      <table>
        <tr class="total-row">
          <td colspan="2">TOTAL</td>
          <td style="text-align:right">${fmt(receipt.vente.total_ttc)} FCFA</td>
        </tr>
        ${receipt.vente.mode_paiement === "especes" && receipt.vente.montant_recu ? `
        <tr>
          <td colspan="2" style="padding:3px 0;color:#555">Versé</td>
          <td style="text-align:right;padding:3px 0;color:#555">${fmt(receipt.vente.montant_recu)} FCFA</td>
        </tr>
        <tr>
          <td colspan="2" style="padding:3px 0;font-weight:bold">Monnaie rendue</td>
          <td style="text-align:right;padding:3px 0;font-weight:bold;color:#16a34a">${fmt(receipt.vente.rendu_monnaie)} FCFA</td>
        </tr>` : ""}
        <tr>
          <td colspan="3" style="padding:3px 0;font-size:10px;color:#666">
            Paiement : ${paiementLabel}
          </td>
        </tr>
      </table>
      <hr class="sep">
      <div class="footer">
        <div>Merci pour votre achat !</div>
        <div style="margin-top:4px">Supermarché étoile du golfe v1.0 — Phase MVP</div>
      </div>
      <script>
        window.onload = () => {
          window.focus();
          setTimeout(() => window.print(), 100);
        };
        window.onafterprint = () => window.close();
      </script>
      </body></html>
    `);
    win.document.close();
  };

  const nouvelleVente = () => {
    setReceipt(null);
    setPanier([]);
    setMontantRecu("");
    setError("");
    setTimeout(() => scanRef.current?.focus(), 50);
  };

  return (
    <div className="flex h-full bg-gray-50">
      {/* ─── Zone gauche : Scan + Panier ──────────────────────────────────── */}
      <div className="flex-1 flex flex-col p-5 gap-4 overflow-hidden">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-800">Interface Caisse</h1>
          <span className="text-xs text-gray-400">Connecté : {user?.nom} ({user?.role})</span>
        </div>

        {/* Zone scan */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
          {/* Scan USB HID */}
          <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-lg px-3 py-2.5">
            <Scan className="text-primary shrink-0" size={20} />
            <input
              ref={scanRef}
              className="flex-1 bg-transparent outline-none text-sm placeholder-gray-400"
              value={scanInput}
              onChange={e => setScanInput(e.target.value)}
              onKeyDown={handleScan}
              placeholder="Scanner code-barres ici (Entrée pour valider)…"
            />
            {scanInput && (
              <button onClick={() => setScanInput("")} className="text-gray-400 hover:text-gray-600">
                <X size={14} />
              </button>
            )}
          </div>

          {/* Recherche manuelle */}
          <div className="relative">
            <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2">
              <Search size={15} className="text-gray-400 shrink-0" />
              <input
                ref={searchRef}
                className="flex-1 bg-transparent outline-none text-sm placeholder-gray-400"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Recherche manuelle par nom d'article…"
              />
              {search && <button onClick={() => setSearch("")}><X size={13} className="text-gray-400" /></button>}
            </div>
            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg z-20 mt-1 overflow-hidden">
                {searchResults.map(a => (
                  <button key={a.id} onClick={() => addToCart(a)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-primary/5 text-left border-b last:border-0 transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{a.nom}</p>
                      <p className="text-xs text-gray-400">{a.categorie_nom || "Sans catégorie"}</p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-sm font-bold text-primary">{fmt(a.prix_vente)} FCFA</p>
                      <p className={`text-xs ${a.stock_actuel === 0 ? "text-red-500 font-semibold" : "text-gray-400"}`}>
                        Stock : {a.stock_actuel}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Erreur */}
        {error && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            <AlertCircle size={15} className="shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError("")}><X size={14} /></button>
          </div>
        )}

        {/* Panier */}
        <div className="flex-1 bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
            <h2 className="font-semibold text-gray-700">
              Panier
              {panier.length > 0 && (
                <span className="ml-2 text-xs bg-primary text-white rounded-full px-2 py-0.5">{panier.length}</span>
              )}
            </h2>
            {panier.length > 0 && (
              <button onClick={() => { setPanier([]); setMontantRecu(""); }}
                className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1">
                <Trash2 size={12} /> Vider
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {panier.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-300 py-12">
                <Scan size={40} className="mb-3" />
                <p className="text-sm">Scannez ou recherchez un article</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {panier.map((l, i) => (
                  <div key={l.article.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 group">
                    <span className="text-xs text-gray-300 w-4">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{l.article.nom}</p>
                      <p className="text-xs text-gray-400">{fmt(l.article.prix_vente)} FCFA / u</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => updateQty(l.article.id, -1)}
                        className="w-7 h-7 rounded-full bg-gray-100 hover:bg-red-100 hover:text-red-600 flex items-center justify-center transition-colors">
                        <Minus size={11} />
                      </button>
                      <span className="w-8 text-center text-sm font-bold text-gray-800">{l.quantite}</span>
                      <button onClick={() => updateQty(l.article.id, 1)}
                        disabled={l.quantite >= l.article.stock_actuel}
                        className="w-7 h-7 rounded-full bg-gray-100 hover:bg-green-100 hover:text-green-600 flex items-center justify-center transition-colors disabled:opacity-30">
                        <Plus size={11} />
                      </button>
                    </div>
                    <span className="text-sm font-bold text-primary w-28 text-right tabular-nums">
                      {fmt(parseInt(l.article.prix_vente) * l.quantite)} FCFA
                    </span>
                    <button onClick={() => setPanier(p => p.filter(x => x.article.id !== l.article.id))}
                      className="text-gray-200 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sous-total bas du panier */}
          {panier.length > 0 && (
            <div className="border-t border-gray-100 px-4 py-2 flex justify-between items-center bg-gray-50/50">
              <span className="text-sm text-gray-500">
                {panier.reduce((s, l) => s + l.quantite, 0)} article{panier.reduce((s, l) => s + l.quantite, 0) > 1 ? "s" : ""}
              </span>
              <span className="text-base font-bold text-primary tabular-nums">{fmt(total)} FCFA</span>
            </div>
          )}
        </div>
      </div>

      {/* ─── Zone droite : Paiement ───────────────────────────────────────── */}
      <div className="w-72 bg-white border-l border-gray-100 flex flex-col shadow-sm">
        {/* Total */}
        <div className="p-5 bg-gradient-to-br from-primary to-primary-light text-white text-center">
          <p className="text-sm opacity-70 uppercase tracking-wide">Total à payer</p>
          <p className="text-4xl font-black mt-1 tabular-nums">{fmt(total)}</p>
          <p className="text-sm opacity-70 mt-0.5">FCFA</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Mode de paiement */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Mode de paiement</p>
            <div className="grid grid-cols-2 gap-1.5">
              {MODES.map(m => (
                <button key={m.id} onClick={() => { setMode(m.id); setMontantRecu(""); }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                    mode === m.id
                      ? "border-primary bg-primary text-white shadow-sm"
                      : "border-gray-200 text-gray-600 hover:border-primary/40 hover:bg-primary/5"
                  }`}>
                  <m.icon size={14} />
                  <span>{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Montant reçu (espèces uniquement) */}
          {mode === "especes" && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Montant reçu (FCFA)</p>
              <input
                className="input text-xl font-bold text-center tabular-nums"
                type="number" min={total}
                value={montantRecu}
                onChange={e => setMontantRecu(e.target.value)}
                placeholder="0"
              />
              {/* Montants rapides */}
              <div className="grid grid-cols-3 gap-1 mt-2">
                {QUICK_AMOUNTS.filter(v => v >= total || v >= total - 1000).slice(0, 6).map(v => (
                  <button key={v} onClick={() => setMontantRecu(String(v))}
                    className={`py-1.5 text-xs rounded-lg border transition-colors ${
                      parseInt(montantRecu) === v
                        ? "border-primary bg-primary/10 text-primary font-bold"
                        : "border-gray-200 hover:border-primary/50 hover:text-primary"
                    }`}>
                    {v >= 1000 ? `${v / 1000}k` : v}
                  </button>
                ))}
              </div>

              {/* Rendu monnaie */}
              {montantRecu && parseInt(montantRecu) >= total && (
                <div className="mt-3 bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                  <p className="text-xs text-green-600 font-medium uppercase">Monnaie à rendre</p>
                  <p className="text-2xl font-black text-green-700 tabular-nums mt-0.5">{fmt(rendu)}</p>
                  <p className="text-xs text-green-500">FCFA</p>
                </div>
              )}
              {montantRecu && parseInt(montantRecu) < total && (
                <div className="mt-3 bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                  <p className="text-xs text-red-600 font-medium">Insuffisant</p>
                  <p className="text-lg font-bold text-red-700 tabular-nums">{fmt(total - parseInt(montantRecu))} FCFA manquants</p>
                </div>
              )}
            </div>
          )}

          {/* Info Yas money/Flooz */}
          {(mode === "momo" || mode === "flooz") && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5 text-xs text-blue-700">
              📱 Vérifiez la confirmation {mode === "momo" ? "Yas money" : "Flooz"} avant de valider.
            </div>
          )}
        </div>

        {/* Bouton validation */}
        <div className="p-4 border-t border-gray-100">
          <button
            onClick={handleValider}
            disabled={!panier.length || loading || (mode === "especes" && !montantOk)}
            className={`w-full py-3.5 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all ${
              panier.length && (mode !== "especes" || montantOk)
                ? "bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-500/30"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}>
            <CheckCircle size={18} />
            {loading ? "Traitement…" : "Valider la vente"}
          </button>
        </div>
      </div>

      {/* ─── Modal Reçu ───────────────────────────────────────────────────── */}
      {receipt && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            {/* En-tête reçu */}
            <div className="bg-gradient-to-br from-primary to-primary-light text-white p-5 text-center">
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-2">
                <CheckCircle size={24} />
              </div>
              <h2 className="text-lg font-black">Vente validée !</h2>
              <p className="text-blue-200 text-sm">Reçu N° {String(receipt.vente.id).padStart(6, "0")}</p>
            </div>

            {/* Détail du reçu */}
            <div className="p-5">
              {/* En-tête boutique */}
              <div className="text-center mb-4 pb-4 border-b border-dashed border-gray-200">
                <p className="text-lg font-black tracking-widest text-primary">Supermarché étoile du golfe</p>
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(receipt.vente.created_at).toLocaleString("fr-FR", {
                    day: "2-digit", month: "2-digit", year: "numeric",
                    hour: "2-digit", minute: "2-digit"
                  })}
                </p>
                <p className="text-xs text-gray-400">Caissier : {receipt.vente.caissier_nom || user?.nom}</p>
              </div>

              {/* Articles */}
              <div className="space-y-1.5 mb-4">
                {receipt.lignes.map(l => (
                  <div key={l.id} className="flex justify-between items-start text-sm">
                    <div className="flex-1 min-w-0 mr-2">
                      <span className="text-gray-700">{l.article_nom}</span>
                      <span className="text-gray-400 text-xs ml-1">×{l.quantite}</span>
                    </div>
                    <span className="font-semibold text-gray-800 tabular-nums whitespace-nowrap">
                      {fmt(l.sous_total)} F
                    </span>
                  </div>
                ))}
              </div>

              {/* Totaux */}
              <div className="border-t border-dashed border-gray-200 pt-3 space-y-1.5">
                <div className="flex justify-between items-center text-base font-black">
                  <span>TOTAL</span>
                  <span className="text-primary tabular-nums">{fmt(receipt.vente.total_ttc)} FCFA</span>
                </div>
                {receipt.vente.mode_paiement === "especes" && receipt.vente.montant_recu && (
                  <>
                    <div className="flex justify-between text-sm text-gray-500">
                      <span>Versé</span>
                      <span className="tabular-nums">{fmt(receipt.vente.montant_recu)} FCFA</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold text-green-600">
                      <span>Monnaie rendue</span>
                      <span className="tabular-nums">{fmt(receipt.vente.rendu_monnaie)} FCFA</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between text-xs text-gray-400 pt-1">
                  <span>Mode de paiement</span>
                  <span className="uppercase font-medium">{receipt.vente.mode_paiement === "momo" ? "yas money" : receipt.vente.mode_paiement}</span>
                </div>
              </div>

              <p className="text-center text-xs text-gray-400 mt-4 italic">Merci pour votre achat !</p>
            </div>

            {/* Actions */}
            <div className="flex gap-2 p-4 border-t border-gray-100">
              <button onClick={printReceipt}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                <Printer size={15} /> Imprimer
              </button>
              <button onClick={nouvelleVente}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary-light transition-colors">
                ➕ Nouvelle vente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
