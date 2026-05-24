import { Router } from "express";
import { pool } from "../db/index.js";
import { requireAuth, auditLog, type AuthRequest } from "../middleware/auth.js";

const router = Router();

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

// Générer un code-barres unique à partir de l'ID
function genCodeBarre(id: number): string {
  // Prefixe 20 + 10 chiffres d'id + checksum = 13 chiffres (EAN-13)
  const base = String(id).padStart(10, "0");
  // Calcul checksum EAN-13
  let sum = 0;
  const digits = ("20" + base).split("").map(Number);
  for (let i = 0; i < 12; i++) sum += digits[i] * (i % 2 === 0 ? 1 : 3);
  const check = (10 - (sum % 10)) % 10;
  return "20" + base + check;
}

function parseArticleIdFromBarcode(code: string): number | null {
  if (!/^\d+$/.test(code) || !code.startsWith("20")) return null;

  // Nouveau format attendu: 13 chiffres (20 + 10 chiffres id + check)
  if (code.length === 13) {
    const id = parseInt(code.slice(2, 12), 10);
    return Number.isNaN(id) ? null : id;
  }

  // Compatibilité avec anciens codes déjà générés en 14 chiffres
  if (code.length === 14) {
    const id = parseInt(code.slice(2, 13), 10);
    return Number.isNaN(id) ? null : id;
  }

  return null;
}

// Liste articles
router.get("/", requireAuth(), async (req, res) => {
  const { search, categorie, alerte } = req.query;
  let query = `
    SELECT a.*, c.nom as categorie_nom, c.rayon
    FROM articles a
    LEFT JOIN categories c ON a.categorie_id = c.id
    WHERE a.actif = true
  `;
  const params: any[] = [];
  if (search) {
    params.push(`%${search}%`);
    query += ` AND (a.nom ILIKE $${params.length} OR a.code_barre ILIKE $${params.length})`;
  }
  if (categorie) {
    params.push(categorie);
    query += ` AND a.categorie_id = $${params.length}`;
  }
  if (alerte === "1") {
    query += ` AND a.stock_actuel <= a.stock_minimum`;
  }
  query += " ORDER BY a.nom ASC";
  const { rows } = await pool.query(query, params);
  res.json(rows);
});

// Scan par code-barres ou ID
router.get("/scan/:code", requireAuth(), async (req, res) => {
  const scannedRaw = req.params.code.trim();
  const scannedCode = normalizeScanCode(scannedRaw);
  const inferredIdRaw = parseArticleIdFromBarcode(scannedRaw);
  const inferredIdNormalized = parseArticleIdFromBarcode(scannedCode);

  const { rows } = await pool.query(
    `SELECT a.*, c.nom as categorie_nom
     FROM articles a LEFT JOIN categories c ON a.categorie_id = c.id
     WHERE (
      a.code_barre = $1 OR a.code_barre = $2
      OR a.id::text = $1 OR a.id::text = $2
      OR a.id = $3 OR a.id = $4
     ) AND a.actif = true
     LIMIT 1`,
    [scannedRaw, scannedCode, inferredIdRaw, inferredIdNormalized]
  );
  if (!rows.length) return res.status(404).json({ error: "Article non trouvé" });
  res.json(rows[0]);
});

// Créer article — formulaire simplifié
router.post("/", requireAuth("admin", "gerant"), async (req: AuthRequest, res) => {
  const { nom, categorieId, prixVente, stockActuel, stockMinimum } = req.body;
  if (!nom || !prixVente) return res.status(400).json({ error: "Nom et prix de vente requis" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Insérer d'abord sans code-barres
    const { rows } = await client.query(
      `INSERT INTO articles (nom, categorie_id, prix_vente, stock_actuel, stock_minimum)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        nom.trim(),
        categorieId || null,
        prixVente,
        parseInt(stockActuel) || 0,
        parseInt(stockMinimum) || 5,
      ]
    );
    const article = rows[0];

    // Générer code-barres basé sur l'ID
    const codeBarre = genCodeBarre(article.id);

    // Mettre à jour avec les codes
    const { rows: updated } = await client.query(
      `UPDATE articles SET code_barre = $1, code_qr = $2, updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [codeBarre, null, article.id]
    );

    // Mouvement de stock initial si stock > 0
    if (parseInt(stockActuel) > 0) {
      await client.query(
        `INSERT INTO mouvements_stock (article_id, type, quantite, user_id, motif)
         VALUES ($1, 'entree', $2, $3, 'Stock initial à la création')`,
        [article.id, parseInt(stockActuel), req.user?.id]
      );
    }

    await client.query("COMMIT");
    await auditLog(req.user?.id, "CREATE_ARTICLE", "articles", article.id, { nom });
    res.status(201).json(updated[0]);
  } catch (e: any) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});

// Modifier article — nom, prix, quantité (stock)
router.put("/:id", requireAuth("admin", "gerant"), async (req: AuthRequest, res) => {
  const { nom, categorieId, prixVente, stockMinimum, stockActuel } = req.body;
  if (!nom || !prixVente) return res.status(400).json({ error: "Nom et prix requis" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lire ancien stock pour tracer le mouvement si changement
    const { rows: old } = await client.query(
      "SELECT stock_actuel FROM articles WHERE id = $1", [req.params.id]
    );
    if (!old.length) return res.status(404).json({ error: "Article non trouvé" });

    const { rows } = await client.query(
      `UPDATE articles SET nom=$1, categorie_id=$2, prix_vente=$3,
        stock_minimum=$4, stock_actuel=$5, updated_at=NOW()
       WHERE id=$6 RETURNING *`,
      [nom.trim(), categorieId || null, prixVente,
       parseInt(stockMinimum) || 5, parseInt(stockActuel), req.params.id]
    );

    // Si la quantité a changé, tracer un ajustement
    const diff = parseInt(stockActuel) - parseInt(old[0].stock_actuel);
    if (diff !== 0) {
      await client.query(
        `INSERT INTO mouvements_stock (article_id, type, quantite, user_id, motif)
         VALUES ($1, 'ajustement', $2, $3, 'Modification manuelle via catalogue')`,
        [req.params.id, Math.abs(diff), req.user?.id]
      );
    }

    await client.query("COMMIT");
    await auditLog(req.user?.id, "UPDATE_ARTICLE", "articles", parseInt(req.params.id), { nom, prixVente, stockActuel });
    res.json(rows[0]);
  } catch (e: any) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});

// Désactiver (soft delete)
router.delete("/:id", requireAuth("admin", "gerant"), async (req: AuthRequest, res) => {
  await pool.query("UPDATE articles SET actif = false WHERE id = $1", [req.params.id]);
  await auditLog(req.user?.id, "DELETE_ARTICLE", "articles", parseInt(req.params.id));
  res.json({ ok: true });
});

// Stats stock pour dashboard
router.get("/stats/stock", requireAuth("admin", "gerant"), async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE stock_actuel <= stock_minimum) as en_alerte,
      COUNT(*) FILTER (WHERE stock_actuel = 0) as rupture,
      COALESCE(SUM(stock_actuel * prix_vente), 0) as valeur_stock
    FROM articles WHERE actif = true
  `);
  res.json(rows[0]);
});

export default router;
