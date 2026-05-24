import { useState, useEffect } from "react";
import api from "../lib/api";
import { FileText, Download, TrendingUp, ShoppingCart, RefreshCw } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from "recharts";

interface VenteRow { id: number; created_at: string; caissier_nom: string; total_ttc: string; mode_paiement: string; statut: string; nb_articles: number; }
interface DashStats {
  aujourd_hui: { nb_ventes: number; chiffre_affaires: number; panier_moyen: number };
  semaine: { nb_ventes: number; chiffre_affaires: number };
  top_articles: Array<{ nom: string; qte_vendue: number; ca: number }>;
  par_heure: Array<{ jour: string; total: number; nb_ventes: number }>;
}

const COLORS = ["#1a3c5e", "#2ecc71", "#f39c12", "#e74c3c", "#9b59b6"];
const fmt = (n: any) => parseInt(n || 0).toLocaleString("fr-FR");

export default function Rapports() {
  const today = new Date().toISOString().split("T")[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];

  const [dateDebut, setDateDebut] = useState(weekAgo);
  const [dateFin, setDateFin] = useState(today);
  const [ventes, setVentes] = useState<VenteRow[]>([]);
  const [stats, setStats] = useState<DashStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"dashboard" | "journal">("dashboard");

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get(`/ventes?dateDebut=${dateDebut}&dateFin=${dateFin}`).catch(() => ({ data: [] })),
      api.get("/rapports/dashboard").catch(() => ({ data: null })),
    ]).then(([v, d]) => {
      setVentes(v.data);
      setStats(d.data);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [dateDebut, dateFin]);

  const handleExportPDF = () => {
    const url = `/api/rapports/pdf?dateDebut=${dateDebut}&dateFin=${dateFin}`;
    window.open(url, "_blank");
  };

  const handleExportExcel = () => {
    const url = `/api/rapports/excel?dateDebut=${dateDebut}&dateFin=${dateFin}`;
    window.open(url, "_blank");
  };

  // Computed stats from ventes list
  const totalCA = ventes.filter(v => v.statut === "validee").reduce((s, v) => s + parseInt(v.total_ttc), 0);
  const nbVentes = ventes.filter(v => v.statut === "validee").length;

  // Par mode paiement
  const parPaiement = Object.entries(
    ventes.filter(v => v.statut === "validee")
      .reduce((acc: Record<string, number>, v) => {
        acc[v.mode_paiement] = (acc[v.mode_paiement] || 0) + parseInt(v.total_ttc);
        return acc;
      }, {})
  ).map(([name, value]) => ({ name: name.toUpperCase(), value }));

  // Par jour
  const parJour = Object.entries(
    ventes.filter(v => v.statut === "validee")
      .reduce((acc: Record<string, number>, v) => {
        const jour = v.created_at.split("T")[0];
        acc[jour] = (acc[jour] || 0) + parseInt(v.total_ttc);
        return acc;
      }, {})
  ).map(([date, total]) => ({
    date: new Date(date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
    CA: total
  })).sort((a, b) => a.date.localeCompare(b.date));

  const tabs = [
    { id: "dashboard", label: "Tableau de bord", icon: TrendingUp },
    { id: "journal", label: "Journal des ventes", icon: ShoppingCart },
  ] as const;

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-800">Rapports & Analyses</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="date" className="input w-36 text-sm" value={dateDebut} max={dateFin}
            onChange={e => setDateDebut(e.target.value)} />
          <span className="text-gray-400 text-sm">→</span>
          <input type="date" className="input w-36 text-sm" value={dateFin} min={dateDebut}
            onChange={e => setDateFin(e.target.value)} />
          <button onClick={load} className="btn-ghost flex items-center gap-1.5 text-sm py-2">
            <RefreshCw size={14} /> Actualiser
          </button>
          <button onClick={handleExportPDF}
            className="btn-ghost flex items-center gap-1.5 text-sm py-2 text-red-600 border-red-200 hover:bg-red-50">
            <FileText size={14} /> PDF
          </button>
          <button onClick={handleExportExcel}
            className="btn-ghost flex items-center gap-1.5 text-sm py-2 text-green-700 border-green-200 hover:bg-green-50">
            <Download size={14} /> Excel
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Ventes validées", value: nbVentes, sub: `du ${new Date(dateDebut).toLocaleDateString("fr-FR")} au ${new Date(dateFin).toLocaleDateString("fr-FR")}` },
          { label: "Chiffre d'affaires", value: `${fmt(totalCA)} FCFA`, sub: "Ventes validées uniquement" },
          { label: "Panier moyen", value: nbVentes ? `${fmt(Math.round(totalCA / nbVentes))} FCFA` : "—", sub: "Par transaction" },
          { label: "Annulations", value: ventes.filter(v => v.statut === "annulee").length, sub: "Sur la période" },
        ].map(c => (
          <div key={c.label} className="card">
            <p className="text-xs text-gray-500 uppercase tracking-wide">{c.label}</p>
            <p className="text-2xl font-bold text-primary mt-1">{c.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id ? "border-primary text-primary" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {/* Dashboard tab */}
      {tab === "dashboard" && !loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* CA par jour */}
            <div className="card">
              <h3 className="font-semibold text-gray-700 mb-3">Chiffre d'affaires par jour</h3>
              {parJour.length > 0
                ? <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={parJour}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => `${v.toLocaleString()} FCFA`} />
                      <Bar dataKey="CA" fill="#1a3c5e" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                : <p className="text-center text-gray-400 py-12">Aucune donnée</p>}
            </div>

            {/* Mode paiement pie */}
            <div className="card">
              <h3 className="font-semibold text-gray-700 mb-3">Répartition par mode de paiement</h3>
              {parPaiement.length > 0
                ? <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={parPaiement} cx="50%" cy="50%" outerRadius={70} dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}>
                        {parPaiement.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => `${v.toLocaleString()} FCFA`} />
                    </PieChart>
                  </ResponsiveContainer>
                : <p className="text-center text-gray-400 py-12">Aucune donnée</p>}
            </div>
          </div>

          {/* Top articles */}
          {stats?.top_articles && stats.top_articles.length > 0 && (
            <div className="card">
              <h3 className="font-semibold text-gray-700 mb-3">Top 10 articles — Aujourd'hui</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stats.top_articles.slice(0, 10).map(a => ({ nom: a.nom.length > 15 ? a.nom.substring(0,15)+"…" : a.nom, ventes: a.qte_vendue }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
                  <XAxis dataKey="nom" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="ventes" fill="#2ecc71" radius={[4,4,0,0]} name="Qté vendue" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Journal tab */}
      {tab === "journal" && (
        <div className="card p-0 overflow-hidden">
          {loading
            ? <div className="py-12 text-center text-gray-400">Chargement…</div>
            : ventes.length === 0
            ? <div className="py-12 text-center text-gray-400">Aucune vente sur cette période</div>
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      {["#", "Date / Heure", "Caissier", "Total TTC", "Paiement", "Statut"].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {ventes.map(v => (
                      <tr key={v.id} className={`hover:bg-gray-50 ${v.statut === "annulee" ? "opacity-50 line-through" : ""}`}>
                        <td className="px-4 py-2.5 text-gray-400 font-mono">#{v.id}</td>
                        <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                          {new Date(v.created_at).toLocaleString("fr-FR", { day:"2-digit", month:"2-digit", year:"2-digit", hour:"2-digit", minute:"2-digit" })}
                        </td>
                        <td className="px-4 py-2.5">{v.caissier_nom || "—"}</td>
                        <td className="px-4 py-2.5 font-bold text-primary">{fmt(v.total_ttc)} FCFA</td>
                        <td className="px-4 py-2.5 capitalize">{v.mode_paiement}</td>
                        <td className="px-4 py-2.5">
                          {v.statut === "validee"
                            ? <span className="badge-success">Validée</span>
                            : <span className="badge-danger">Annulée</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      )}
    </div>
  );
}
