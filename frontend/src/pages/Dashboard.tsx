import { useEffect, useState } from "react";
import api from "../lib/api";
import { TrendingUp, ShoppingCart, AlertTriangle, Package } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface Stats {
  aujourd_hui: { nb_ventes: number; chiffre_affaires: number; panier_moyen: number; nb_annulations: number };
  semaine: { nb_ventes: number; chiffre_affaires: number };
  alertes_stock: number;
  articles: { total: number; valeur_stock: number };
  top_articles: Array<{ nom: string; qte_vendue: number; ca: number }>;
  par_heure: Array<{ jour: string; total: number; nb_ventes: number }>;
}

const fmt = (n: any) => parseInt(n || 0).toLocaleString("fr-FR");

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/rapports/dashboard").then(r => setStats(r.data)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;
  if (!stats) return null;

  const cards = [
    { label: "Ventes aujourd'hui", value: stats.aujourd_hui.nb_ventes, sub: `${fmt(stats.aujourd_hui.chiffre_affaires)} FCFA`, icon: ShoppingCart, color: "bg-blue-500" },
    { label: "CA Semaine", value: `${fmt(stats.semaine.chiffre_affaires)} FCFA`, sub: `${stats.semaine.nb_ventes} ventes`, icon: TrendingUp, color: "bg-green-500" },
    { label: "Articles en alerte", value: stats.alertes_stock, sub: "Stock faible", icon: AlertTriangle, color: stats.alertes_stock > 0 ? "bg-yellow-500" : "bg-gray-400" },
    { label: "Total articles", value: stats.articles.total, sub: `Valeur: ${fmt(stats.articles.valeur_stock)} FCFA`, icon: Package, color: "bg-purple-500" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Tableau de bord</h1>
        <span className="text-sm text-gray-500">{new Date().toLocaleDateString("fr-FR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(c => (
          <div key={c.label} className="card flex items-start gap-3">
            <div className={`${c.color} rounded-lg p-2.5 text-white`}>
              <c.icon size={20} />
            </div>
            <div>
              <p className="text-xs text-gray-500">{c.label}</p>
              <p className="text-xl font-bold text-gray-800">{c.value}</p>
              <p className="text-xs text-gray-400">{c.sub}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly chart */}
        <div className="card">
          <h2 className="font-semibold text-gray-700 mb-4">Ventes de la semaine</h2>
          {stats.par_heure.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={stats.par_heure.map(d => ({
                jour: new Date(d.jour).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" }),
                total: parseInt(String(d.total)),
                ventes: d.nb_ventes,
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="jour" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => `${v.toLocaleString()} FCFA`} />
                <Bar dataKey="total" fill="#1a3c5e" radius={[4,4,0,0]} name="CA (FCFA)" />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-center text-gray-400 py-12">Aucune vente cette semaine</p>}
        </div>

        {/* Articles vendus du jour */}
        <div className="card">
          <h2 className="font-semibold text-gray-700 mb-4">Articles vendus aujourd'hui (du plus vendu au moins vendu)</h2>
          {stats.top_articles.length > 0 ? (
            <div className="space-y-3">
              {stats.top_articles.map((a, i) => (
                <div key={a.nom} className="flex items-center gap-3">
                  <span className="w-5 h-5 rounded-full bg-primary text-white text-xs flex items-center justify-center font-bold">{i+1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700 truncate">{a.nom}</p>
                    <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
                      <div className="bg-primary h-1.5 rounded-full"
                        style={{ width: `${(a.qte_vendue / (stats.top_articles[0]?.qte_vendue || 1)) * 100}%` }} />
                    </div>
                  </div>
                  <span className="text-xs text-gray-500 whitespace-nowrap">{a.qte_vendue} vte</span>
                </div>
              ))}
            </div>
          ) : <p className="text-center text-gray-400 py-12">Aucune vente aujourd'hui</p>}
        </div>
      </div>
    </div>
  );
}
