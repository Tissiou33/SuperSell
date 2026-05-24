import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { pool } from "../db/index.js";

export interface AuthRequest extends Request {
  user?: { id: number; role: string; nom: string };
}

export function requireAuth(...roles: string[]) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "Non authentifié" });

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as any;

      // Check session is still active
      const { rows } = await pool.query(
        "SELECT id FROM sessions WHERE token = $1 AND fermeture IS NULL",
        [token]
      );
      if (!rows.length) return res.status(401).json({ error: "Session expirée" });

      req.user = { id: payload.id, role: payload.role, nom: payload.nom };

      if (roles.length && !roles.includes(payload.role)) {
        return res.status(403).json({ error: "Accès refusé" });
      }
      next();
    } catch {
      return res.status(401).json({ error: "Token invalide" });
    }
  };
}

export async function auditLog(
  userId: number | undefined,
  action: string,
  entite?: string,
  entiteId?: number,
  details?: object
) {
  await pool.query(
    `INSERT INTO audit_logs (user_id, action, entite, entite_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId ?? null, action, entite ?? null, entiteId ?? null, details ? JSON.stringify(details) : null]
  );
}
