import { Router } from "express";
import { pool } from "../db/index.js";
import { requireAuth, auditLog, type AuthRequest } from "../middleware/auth.js";

const router = Router();

// Stock movements history
router.get("/mouvements", requireAuth("admin", "gerant"), async (req, res) => {
  const { articleId, type, dateDebut, dateFin } = req.query;
  let query = `
    SELECT ms.*, a.nom as article_nom, u.nom as user_nom, f.nom as fournisseur_nom
    FROM mouvements_stock ms
    JOIN articles a ON ms.article_id = a.id
    LEFT JOIN utilisateurs u ON ms.user_id = u.id
    LEFT JOIN fournisseurs f ON ms.fournisseur_id = f.id
    WHERE 1=1
  `;
  const params: any[] = [];
  if (articleId) { params.push(articleId); query += ` AND ms.article_id = $${params.length}`; }
  if (type) { params.push(type); query += ` AND ms.type = $${params.length}`; }
  if (dateDebut) { params.push(dateDebut); query += ` AND DATE(ms.created_at) >= $${params.length}`; }
  if (dateFin) { params.push(dateFin); query += ` AND DATE(ms.created_at) <= $${params.length}`; }
  query += " ORDER BY ms.created_at DESC LIMIT 500";
  const { rows } = await pool.query(query, params);
  res.json(rows);
});

// Réapprovisionnement (entrée stock)
router.post("/entree", requireAuth("admin", "gerant"), async (req: AuthRequest, res) => {
  const { articleId, quantite, fournisseurId, prixAchat, motif } = req.body;
  if (!articleId || !quantite) return res.status(400).json({ error: "Données manquantes" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE articles SET stock_actuel = stock_actuel + $1, updated_at = NOW() WHERE id = $2`,
      [quantite, articleId]
    );
    const { rows } = await client.query(
      `INSERT INTO mouvements_stock (article_id, type, quantite, user_id, fournisseur_id, prix_achat, motif)
       VALUES ($1, 'entree', $2, $3, $4, $5, $6) RETURNING *`,
      [articleId, quantite, req.user?.id, fournisseurId || null, prixAchat || null,
       motif || "Réapprovisionnement"]
    );
    await client.query("COMMIT");
    await auditLog(req.user?.id, "ENTREE_STOCK", "articles", articleId, { quantite });
    res.status(201).json(rows[0]);
  } catch (err: any) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Ajustement manuel (gérant uniquement)
router.post("/ajustement", requireAuth("admin", "gerant"), async (req: AuthRequest, res) => {
  const { articleId, newStock, motif } = req.body;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: artRows } = await client.query(
      "SELECT stock_actuel FROM articles WHERE id = $1", [articleId]
    );
    if (!artRows.length) return res.status(404).json({ error: "Article non trouvé" });

    const diff = newStock - artRows[0].stock_actuel;
    await client.query(
      "UPDATE articles SET stock_actuel = $1, updated_at = NOW() WHERE id = $2",
      [newStock, articleId]
    );
    await client.query(
      `INSERT INTO mouvements_stock (article_id, type, quantite, user_id, motif)
       VALUES ($1, 'ajustement', $2, $3, $4)`,
      [articleId, Math.abs(diff), req.user?.id, motif || "Ajustement inventaire"]
    );
    await client.query("COMMIT");
    await auditLog(req.user?.id, "AJUSTEMENT_STOCK", "articles", articleId,
      { ancien: artRows[0].stock_actuel, nouveau: newStock, motif });
    res.json({ ok: true });
  } catch (err: any) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Articles en alerte
router.get("/alertes", requireAuth(), async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT a.id, a.nom, a.stock_actuel, a.stock_minimum, a.unite,
      c.nom as categorie_nom
    FROM articles a LEFT JOIN categories c ON a.categorie_id = c.id
    WHERE a.actif = true AND a.stock_actuel <= a.stock_minimum
    ORDER BY a.stock_actuel ASC
  `);
  res.json(rows);
});

export default router;
