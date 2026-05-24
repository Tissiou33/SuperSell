import { Router } from "express";
import { pool } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";

const router = Router();

async function getVenteStats(dateDebut: string, dateFin: string) {
  const { rows: summary } = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE statut = 'validee') as nb_ventes,
      COALESCE(SUM(total_ttc) FILTER (WHERE statut = 'validee'), 0) as chiffre_affaires,
      COALESCE(AVG(total_ttc) FILTER (WHERE statut = 'validee'), 0) as panier_moyen,
      COUNT(*) FILTER (WHERE statut = 'annulee') as nb_annulations
    FROM ventes
    WHERE DATE(created_at) BETWEEN $1 AND $2
  `, [dateDebut, dateFin]);

  const { rows: parJour } = await pool.query(`
    SELECT DATE(created_at) as jour,
      COUNT(*) FILTER (WHERE statut='validee') as nb_ventes,
      COALESCE(SUM(total_ttc) FILTER (WHERE statut='validee'), 0) as total
    FROM ventes WHERE DATE(created_at) BETWEEN $1 AND $2
    GROUP BY DATE(created_at) ORDER BY jour
  `, [dateDebut, dateFin]);

  const { rows: topArticles } = await pool.query(`
    SELECT a.nom, SUM(lv.quantite) as qte_vendue, SUM(lv.sous_total) as ca
    FROM lignes_vente lv
    JOIN ventes v ON lv.vente_id = v.id
    JOIN articles a ON lv.article_id = a.id
    WHERE v.statut = 'validee' AND DATE(v.created_at) BETWEEN $1 AND $2
    GROUP BY a.id, a.nom ORDER BY qte_vendue DESC, a.nom ASC
  `, [dateDebut, dateFin]);

  const { rows: parPaiement } = await pool.query(`
    SELECT mode_paiement, COUNT(*) as nb, SUM(total_ttc) as total
    FROM ventes WHERE statut = 'validee' AND DATE(created_at) BETWEEN $1 AND $2
    GROUP BY mode_paiement
  `, [dateDebut, dateFin]);

  return { summary: summary[0], parJour, topArticles, parPaiement };
}

// Dashboard stats
router.get("/dashboard", requireAuth("admin", "gerant"), async (_req, res) => {
  const today = new Date().toISOString().split("T")[0];
  const monday = new Date();
  monday.setDate(monday.getDate() - monday.getDay() + 1);
  const weekStart = monday.toISOString().split("T")[0];

  const stats = await getVenteStats(today, today);
  const weekStats = await getVenteStats(weekStart, today);
  const { rows: alertes } = await pool.query(
    "SELECT COUNT(*) FROM articles WHERE actif=true AND stock_actuel <= stock_minimum"
  );
  const { rows: articleStats } = await pool.query(
    "SELECT COUNT(*) as total, SUM(stock_actuel * prix_vente) as valeur_stock FROM articles WHERE actif=true"
  );

  res.json({
    aujourd_hui: stats.summary,
    semaine: weekStats.summary,
    alertes_stock: parseInt(alertes[0].count),
    articles: articleStats[0],
    top_articles: stats.topArticles,
    par_heure: stats.parJour,
  });
});

// PDF Report
router.get("/pdf", requireAuth("admin", "gerant"), async (req, res) => {
  const { dateDebut, dateFin, titre } = req.query as Record<string, string>;
  const debut = dateDebut || new Date().toISOString().split("T")[0];
  const fin = dateFin || debut;

  const stats = await getVenteStats(debut, fin);

  const doc = new PDFDocument({ margin: 50, size: "A4" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="rapport-${debut}.pdf"`);
  doc.pipe(res);

  // Header
  doc.fontSize(22).fillColor("#1a3c5e").text("Supermarché étoile du golfe", 50, 50);
  doc.fontSize(14).fillColor("#666").text(titre || `Rapport du ${debut} au ${fin}`, 50, 80);
  doc.moveTo(50, 105).lineTo(545, 105).stroke("#1a3c5e");

  // Summary boxes
  doc.fontSize(12).fillColor("#000");
  const s = stats.summary;
  let y = 130;
  const boxes = [
    { label: "Ventes validées", val: s.nb_ventes },
    { label: "Chiffre d'affaires", val: `${parseInt(s.chiffre_affaires).toLocaleString()} FCFA` },
    { label: "Panier moyen", val: `${parseInt(s.panier_moyen).toLocaleString()} FCFA` },
    { label: "Annulations", val: s.nb_annulations },
  ];
  boxes.forEach((b, i) => {
    const x = 50 + (i % 2) * 250;
    const by = y + Math.floor(i / 2) * 60;
    doc.rect(x, by, 220, 45).fillAndStroke("#f0f4f8", "#ddd");
    doc.fillColor("#666").fontSize(9).text(b.label, x + 10, by + 8);
    doc.fillColor("#1a3c5e").fontSize(16).text(String(b.val), x + 10, by + 20);
  });

  y += 150;
  // Top articles
  doc.fontSize(13).fillColor("#1a3c5e").text("Top 10 articles vendus", 50, y);
  y += 20;
  doc.fontSize(9).fillColor("#666");
  ["Article", "Quantité", "CA (FCFA)"].forEach((h, i) => {
    doc.text(h, 50 + [0, 300, 400][i], y);
  });
  y += 15;
  doc.moveTo(50, y).lineTo(545, y).stroke("#ddd");
  y += 5;
  stats.topArticles.forEach((a: any) => {
    doc.fillColor("#000").fontSize(9);
    doc.text(a.nom.substring(0, 35), 50, y);
    doc.text(a.qte_vendue, 300, y);
    doc.text(parseInt(a.ca).toLocaleString(), 400, y);
    y += 15;
  });

  // Par mode paiement
  y += 20;
  doc.fontSize(13).fillColor("#1a3c5e").text("Répartition par mode de paiement", 50, y);
  y += 20;
  stats.parPaiement.forEach((p: any) => {
    doc.fontSize(10).fillColor("#000");
    doc.text(`${p.mode_paiement}: ${p.nb} ventes — ${parseInt(p.total).toLocaleString()} FCFA`, 50, y);
    y += 15;
  });

  doc.fontSize(8).fillColor("#999")
    .text(`Généré le ${new Date().toLocaleString("fr-FR")} — Supermarché étoile du golfe v1.0`, 50, 780, { align: "center" });

  doc.end();
});

// Excel report
router.get("/excel", requireAuth("admin", "gerant"), async (req, res) => {
  const { dateDebut, dateFin } = req.query as Record<string, string>;
  const debut = dateDebut || new Date().toISOString().split("T")[0];
  const fin = dateFin || debut;

  const { rows: ventes } = await pool.query(`
    SELECT v.id, v.created_at, u.nom as caissier, v.total_ttc,
      v.mode_paiement, v.statut, v.montant_recu, v.rendu_monnaie
    FROM ventes v LEFT JOIN utilisateurs u ON v.caissier_id = u.id
    WHERE DATE(v.created_at) BETWEEN $1 AND $2
    ORDER BY v.created_at
  `, [debut, fin]);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Supermarché étoile du golfe";

  const sheet = workbook.addWorksheet("Ventes");
  sheet.columns = [
    { header: "ID", key: "id", width: 8 },
    { header: "Date/Heure", key: "date", width: 20 },
    { header: "Caissier", key: "caissier", width: 20 },
    { header: "Total TTC (FCFA)", key: "total", width: 18 },
    { header: "Mode paiement", key: "paiement", width: 15 },
    { header: "Statut", key: "statut", width: 12 },
  ];
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1a3c5e" } };

  ventes.forEach(v => {
    sheet.addRow({
      id: v.id,
      date: new Date(v.created_at).toLocaleString("fr-FR"),
      caissier: v.caissier,
      total: parseInt(v.total_ttc),
      paiement: v.mode_paiement,
      statut: v.statut,
    });
  });

  // Stock sheet
  const stockSheet = workbook.addWorksheet("Stock actuel");
  stockSheet.columns = [
    { header: "Article", key: "nom", width: 30 },
    { header: "Catégorie", key: "cat", width: 20 },
    { header: "Stock actuel", key: "stock", width: 14 },
    { header: "Stock minimum", key: "min", width: 14 },
    { header: "Statut", key: "statut", width: 12 },
  ];
  stockSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  stockSheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1a3c5e" } };

  const { rows: stockData } = await pool.query(`
    SELECT a.nom, c.nom as categorie, a.stock_actuel, a.stock_minimum
    FROM articles a LEFT JOIN categories c ON a.categorie_id = c.id
    WHERE a.actif = true ORDER BY a.nom
  `);
  stockData.forEach(a => {
    const row = stockSheet.addRow({
      nom: a.nom, cat: a.categorie,
      stock: a.stock_actuel, min: a.stock_minimum,
      statut: a.stock_actuel <= a.stock_minimum ? "⚠ Alerte" : "OK"
    });
    if (a.stock_actuel <= a.stock_minimum) {
      row.getCell("statut").font = { color: { argb: "FFCC0000" }, bold: true };
    }
  });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="rapport-${debut}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
});

export default router;
