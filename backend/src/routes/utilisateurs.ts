import { Router } from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db/index.js";
import { requireAuth, auditLog, type AuthRequest } from "../middleware/auth.js";

const router = Router();

// ─── Utilisateurs ────────────────────────────────────────────────────────────
router.get("/", requireAuth("admin", "gerant"), async (_req, res) => {
  const { rows } = await pool.query(
    "SELECT id, nom, identifiant, role, actif, created_at FROM utilisateurs ORDER BY nom"
  );
  res.json(rows);
});

router.post("/", requireAuth("admin"), async (req: AuthRequest, res) => {
  const { nom, identifiant, motDePasse, role } = req.body;
  if (!nom || !identifiant || !motDePasse) return res.status(400).json({ error: "Données manquantes" });
  const hash = await bcrypt.hash(motDePasse, 12);
  try {
    const { rows } = await pool.query(
      "INSERT INTO utilisateurs (nom, identifiant, mot_de_passe_hash, role) VALUES ($1,$2,$3,$4) RETURNING id,nom,identifiant,role",
      [nom, identifiant, hash, role || "caissier"]
    );
    await auditLog(req.user?.id, "CREATE_USER", "utilisateurs", rows[0].id, { nom, role });
    res.status(201).json(rows[0]);
  } catch (e: any) {
    if (e.code === "23505") return res.status(400).json({ error: "Identifiant déjà utilisé" });
    throw e;
  }
});

router.put("/:id", requireAuth("admin"), async (req: AuthRequest, res) => {
  const { nom, role, actif, motDePasse } = req.body;
  if (motDePasse) {
    const hash = await bcrypt.hash(motDePasse, 12);
    await pool.query(
      "UPDATE utilisateurs SET nom=$1, role=$2, actif=$3, mot_de_passe_hash=$4 WHERE id=$5",
      [nom, role, actif ?? true, hash, req.params.id]
    );
  } else {
    await pool.query(
      "UPDATE utilisateurs SET nom=$1, role=$2, actif=$3 WHERE id=$4",
      [nom, role, actif ?? true, req.params.id]
    );
  }
  await auditLog(req.user?.id, "UPDATE_USER", "utilisateurs", parseInt(req.params.id));
  res.json({ ok: true });
});

// ─── Categories ──────────────────────────────────────────────────────────────
router.get("/categories", requireAuth(), async (_req, res) => {
  const { rows } = await pool.query("SELECT * FROM categories ORDER BY nom");
  res.json(rows);
});

router.post("/categories", requireAuth("admin", "gerant"), async (req: AuthRequest, res) => {
  const { nom, rayon } = req.body;
  const { rows } = await pool.query("INSERT INTO categories (nom, rayon) VALUES ($1,$2) RETURNING *", [nom, rayon]);
  res.status(201).json(rows[0]);
});

router.put("/categories/:id", requireAuth("admin", "gerant"), async (req: AuthRequest, res) => {
  const { nom, rayon } = req.body;
  await pool.query("UPDATE categories SET nom=$1, rayon=$2 WHERE id=$3", [nom, rayon, req.params.id]);
  res.json({ ok: true });
});

// ─── Fournisseurs ─────────────────────────────────────────────────────────────
router.get("/fournisseurs", requireAuth(), async (_req, res) => {
  const { rows } = await pool.query("SELECT * FROM fournisseurs ORDER BY nom");
  res.json(rows);
});

router.post("/fournisseurs", requireAuth("admin", "gerant"), async (req: AuthRequest, res) => {
  const { nom, contact, adresse } = req.body;
  const { rows } = await pool.query(
    "INSERT INTO fournisseurs (nom, contact, adresse) VALUES ($1,$2,$3) RETURNING *",
    [nom, contact, adresse]
  );
  res.status(201).json(rows[0]);
});

// ─── Config ───────────────────────────────────────────────────────────────────
router.get("/config", requireAuth("admin"), async (_req, res) => {
  const { rows } = await pool.query("SELECT cle, valeur FROM config");
  res.json(Object.fromEntries(rows.map(r => [r.cle, r.valeur])));
});

router.put("/config", requireAuth("admin"), async (req: AuthRequest, res) => {
  for (const [cle, valeur] of Object.entries(req.body)) {
    await pool.query(
      "INSERT INTO config (cle, valeur) VALUES ($1,$2) ON CONFLICT (cle) DO UPDATE SET valeur=$2",
      [cle, valeur]
    );
  }
  await auditLog(req.user?.id, "UPDATE_CONFIG");
  res.json({ ok: true });
});

export default router;
