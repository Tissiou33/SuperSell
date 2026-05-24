import { Router } from "express";
import { pool } from "../db/index.js";
import { requireAuth, auditLog, type AuthRequest } from "../middleware/auth.js";

const router = Router();

// Create a sale
router.post("/", requireAuth(), async (req: AuthRequest, res) => {
  const { lignes, modePaiement, montantRecu } = req.body;
  if (!lignes?.length) return res.status(400).json({ error: "Panier vide" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let totalTtc = 0;
    const lignesDetails: any[] = [];

    for (const l of lignes) {
      const { rows: artRows } = await client.query(
        "SELECT id, nom, prix_vente, stock_actuel FROM articles WHERE id = $1 AND actif = true",
        [l.articleId]
      );
      if (!artRows.length) throw new Error(`Article ${l.articleId} non trouvé`);
      const art = artRows[0];
      if (art.stock_actuel < l.quantite) throw new Error(`Stock insuffisant pour ${art.nom}`);

      const sousTotal = art.prix_vente * l.quantite;
      totalTtc += sousTotal;
      lignesDetails.push({ ...l, prixUnitaire: art.prix_vente, sousTotal, nom: art.nom });
    }

    const renduMonnaie = montantRecu ? montantRecu - totalTtc : null;

    const { rows: venteRows } = await client.query(
      `INSERT INTO ventes (caissier_id, total_ttc, mode_paiement, montant_recu, rendu_monnaie)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user?.id, totalTtc, modePaiement || "especes", montantRecu || null, renduMonnaie]
    );
    const vente = venteRows[0];

    for (const l of lignesDetails) {
      await client.query(
        `INSERT INTO lignes_vente (vente_id, article_id, quantite, prix_unitaire, sous_total)
         VALUES ($1, $2, $3, $4, $5)`,
        [vente.id, l.articleId, l.quantite, l.prixUnitaire, l.sousTotal]
      );
      // Decrement stock
      await client.query(
        `UPDATE articles SET stock_actuel = stock_actuel - $1, updated_at = NOW() WHERE id = $2`,
        [l.quantite, l.articleId]
      );
      // Stock movement
      await client.query(
        `INSERT INTO mouvements_stock (article_id, type, quantite, user_id, motif)
         VALUES ($1, 'sortie', $2, $3, $4)`,
        [l.articleId, l.quantite, req.user?.id, `Vente #${vente.id}`]
      );
    }

    await client.query("COMMIT");
    await auditLog(req.user?.id, "CREATE_VENTE", "ventes", vente.id, { total: totalTtc });

    // Return full receipt data
    const { rows: receipt } = await pool.query(
      `SELECT v.*, u.nom as caissier_nom FROM ventes v
       LEFT JOIN utilisateurs u ON v.caissier_id = u.id WHERE v.id = $1`,
      [vente.id]
    );
    const { rows: receiptLines } = await pool.query(
      `SELECT lv.*, a.nom as article_nom FROM lignes_vente lv
       JOIN articles a ON lv.article_id = a.id WHERE lv.vente_id = $1`,
      [vente.id]
    );

    res.status(201).json({ vente: receipt[0], lignes: receiptLines });
  } catch (err: any) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Get sales list
router.get("/", requireAuth("admin", "gerant"), async (req, res) => {
  const { date, caissier } = req.query;
  let query = `
    SELECT v.*, u.nom as caissier_nom,
      (SELECT COUNT(*) FROM lignes_vente WHERE vente_id = v.id) as nb_articles
    FROM ventes v LEFT JOIN utilisateurs u ON v.caissier_id = u.id WHERE 1=1
  `;
  const params: any[] = [];
  if (date) {
    params.push(date);
    query += ` AND DATE(v.created_at) = $${params.length}`;
  }
  if (caissier) {
    params.push(caissier);
    query += ` AND v.caissier_id = $${params.length}`;
  }
  query += " ORDER BY v.created_at DESC LIMIT 200";
  const { rows } = await pool.query(query, params);
  res.json(rows);
});

// Get single sale details
router.get("/:id", requireAuth(), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT v.*, u.nom as caissier_nom FROM ventes v
     LEFT JOIN utilisateurs u ON v.caissier_id = u.id WHERE v.id = $1`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: "Vente non trouvée" });

  const { rows: lignes } = await pool.query(
    `SELECT lv.*, a.nom as article_nom FROM lignes_vente lv
     JOIN articles a ON lv.article_id = a.id WHERE lv.vente_id = $1`,
    [req.params.id]
  );
  res.json({ vente: rows[0], lignes });
});

// Cancel a sale (gerant only)
router.patch("/:id/annuler", requireAuth("admin", "gerant"), async (req: AuthRequest, res) => {
  const { motif } = req.body;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      "SELECT * FROM ventes WHERE id = $1 AND statut = 'validee'",
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Vente non trouvée ou déjà annulée" });

    await client.query(
      "UPDATE ventes SET statut = 'annulee', motif_annulation = $1 WHERE id = $2",
      [motif, req.params.id]
    );

    // Restore stock
    const { rows: lignes } = await client.query(
      "SELECT * FROM lignes_vente WHERE vente_id = $1",
      [req.params.id]
    );
    for (const l of lignes) {
      await client.query(
        "UPDATE articles SET stock_actuel = stock_actuel + $1 WHERE id = $2",
        [l.quantite, l.article_id]
      );
      await client.query(
        `INSERT INTO mouvements_stock (article_id, type, quantite, user_id, motif)
         VALUES ($1, 'entree', $2, $3, $4)`,
        [l.article_id, l.quantite, req.user?.id, `Annulation vente #${req.params.id}`]
      );
    }
    await client.query("COMMIT");
    await auditLog(req.user?.id, "ANNULER_VENTE", "ventes", parseInt(req.params.id), { motif });
    res.json({ ok: true });
  } catch (err: any) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

export default router;
