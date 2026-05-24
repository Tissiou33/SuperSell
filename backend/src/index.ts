import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { pool } from "./db/index.js";

import authRoutes from "./routes/auth.js";
import articlesRoutes from "./routes/articles.js";
import ventesRoutes from "./routes/ventes.js";
import stocksRoutes from "./routes/stocks.js";
import rapportsRoutes from "./routes/rapports.js";
import utilisateursRoutes from "./routes/utilisateurs.js";

const app = express();
const PORT = process.env.PORT || 8080;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: "*", methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"] }));
app.use(morgan("dev"));
app.use(express.json({ limit: "10mb" }));

app.use("/api/auth/login", rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));

app.use("/api/auth", authRoutes);
app.use("/api/articles", articlesRoutes);
app.use("/api/ventes", ventesRoutes);
app.use("/api/stocks", stocksRoutes);
app.use("/api/rapports", rapportsRoutes);

// All admin routes through utilisateurs router
app.use("/api/utilisateurs", utilisateursRoutes);
app.use("/api/categories", (req, _res, next) => { (req as any).baseOverride = true; next(); }, utilisateursRoutes);
app.use("/api/fournisseurs", (req, _res, next) => { (req as any).baseOverride = true; next(); }, utilisateursRoutes);
app.use("/api/config", (req, _res, next) => { (req as any).baseOverride = true; next(); }, utilisateursRoutes);

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", version: "1.0.0-MVP" });
  } catch {
    res.status(503).json({ status: "error" });
  }
});

app.listen(PORT, () => {
  console.log(`✅  Supermarché étoile du golfe API → http://localhost:${PORT}/api`);
});
