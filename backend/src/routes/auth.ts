import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../db/index.js";
import { requireAuth, auditLog, type AuthRequest } from "../middleware/auth.js";

const router = Router();

router.post("/login", async (req, res) => {
  const { identifiant, motDePasse } = req.body;
  if (!identifiant || !motDePasse)
    return res.status(400).json({ error: "Identifiant et mot de passe requis" });

  const { rows } = await pool.query(
    "SELECT * FROM utilisateurs WHERE identifiant = $1 AND actif = true",
    [identifiant]
  );
  const user = rows[0];
  if (!user) return res.status(401).json({ error: "Identifiant ou mot de passe incorrect" });

  const valid = await bcrypt.compare(motDePasse, user.mot_de_passe_hash);
  if (!valid) return res.status(401).json({ error: "Identifiant ou mot de passe incorrect" });

  const token = jwt.sign(
    { id: user.id, role: user.role, nom: user.nom },
    process.env.JWT_SECRET!,
    { expiresIn: "12h" }
  );

  await pool.query(
    "INSERT INTO sessions (user_id, token) VALUES ($1, $2)",
    [user.id, token]
  );
  await auditLog(user.id, "LOGIN", "utilisateurs", user.id);

  res.json({
    token,
    user: { id: user.id, nom: user.nom, role: user.role, identifiant: user.identifiant }
  });
});

router.post("/logout", requireAuth(), async (req: AuthRequest, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  await pool.query(
    "UPDATE sessions SET fermeture = NOW() WHERE token = $1",
    [token]
  );
  await auditLog(req.user?.id, "LOGOUT");
  res.json({ ok: true });
});

router.get("/me", requireAuth(), async (req: AuthRequest, res) => {
  const { rows } = await pool.query(
    "SELECT id, nom, identifiant, role FROM utilisateurs WHERE id = $1",
    [req.user?.id]
  );
  res.json(rows[0]);
});

// Change password
router.put("/password", requireAuth(), async (req: AuthRequest, res) => {
  const { ancien, nouveau } = req.body;
  const { rows } = await pool.query(
    "SELECT mot_de_passe_hash FROM utilisateurs WHERE id = $1",
    [req.user?.id]
  );
  const valid = await bcrypt.compare(ancien, rows[0].mot_de_passe_hash);
  if (!valid) return res.status(400).json({ error: "Ancien mot de passe incorrect" });

  const hash = await bcrypt.hash(nouveau, 12);
  await pool.query("UPDATE utilisateurs SET mot_de_passe_hash = $1 WHERE id = $2", [hash, req.user?.id]);
  await auditLog(req.user?.id, "CHANGE_PASSWORD");
  res.json({ ok: true });
});

export default router;
