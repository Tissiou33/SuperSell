import {
  pgTable, serial, varchar, integer, numeric, boolean,
  timestamp, text, pgEnum, json
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["admin", "gerant", "caissier"]);
export const mouvTypeEnum = pgEnum("mouv_type", ["entree", "sortie", "ajustement"]);
export const paiementEnum = pgEnum("mode_paiement", ["especes", "momo", "flooz", "carte"]);
export const venteStatutEnum = pgEnum("vente_statut", ["validee", "annulee"]);

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  nom: varchar("nom", { length: 100 }).notNull(),
  rayon: varchar("rayon", { length: 100 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const fournisseurs = pgTable("fournisseurs", {
  id: serial("id").primaryKey(),
  nom: varchar("nom", { length: 150 }).notNull(),
  contact: varchar("contact", { length: 100 }),
  adresse: text("adresse"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const articles = pgTable("articles", {
  id: serial("id").primaryKey(),
  nom: varchar("nom", { length: 200 }).notNull(),
  categorieId: integer("categorie_id").references(() => categories.id),
  fournisseurId: integer("fournisseur_id").references(() => fournisseurs.id),
  prixVente: numeric("prix_vente", { precision: 12, scale: 0 }).notNull(),
  prixAchat: numeric("prix_achat", { precision: 12, scale: 0 }),
  stockActuel: integer("stock_actuel").notNull().default(0),
  stockMinimum: integer("stock_minimum").notNull().default(5),
  unite: varchar("unite", { length: 30 }).default("unite"),
  codeBarre: varchar("code_barre", { length: 50 }),
  codeQr: text("code_qr"),
  actif: boolean("actif").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const utilisateurs = pgTable("utilisateurs", {
  id: serial("id").primaryKey(),
  nom: varchar("nom", { length: 100 }).notNull(),
  identifiant: varchar("identifiant", { length: 50 }).notNull().unique(),
  motDePasseHash: text("mot_de_passe_hash").notNull(),
  role: roleEnum("role").notNull().default("caissier"),
  actif: boolean("actif").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => utilisateurs.id).notNull(),
  token: text("token").notNull().unique(),
  ouverture: timestamp("ouverture").defaultNow(),
  fermeture: timestamp("fermeture"),
});

export const ventes = pgTable("ventes", {
  id: serial("id").primaryKey(),
  caisssierId: integer("caissier_id").references(() => utilisateurs.id),
  totalTtc: numeric("total_ttc", { precision: 12, scale: 0 }).notNull(),
  modePaiement: paiementEnum("mode_paiement").notNull().default("especes"),
  montantRecu: numeric("montant_recu", { precision: 12, scale: 0 }),
  renduMonnaie: numeric("rendu_monnaie", { precision: 12, scale: 0 }),
  statut: venteStatutEnum("statut").notNull().default("validee"),
  motifAnnulation: text("motif_annulation"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const lignesVente = pgTable("lignes_vente", {
  id: serial("id").primaryKey(),
  venteId: integer("vente_id").references(() => ventes.id).notNull(),
  articleId: integer("article_id").references(() => articles.id).notNull(),
  quantite: integer("quantite").notNull(),
  prixUnitaire: numeric("prix_unitaire", { precision: 12, scale: 0 }).notNull(),
  sousTotal: numeric("sous_total", { precision: 12, scale: 0 }).notNull(),
});

export const mouvementsStock = pgTable("mouvements_stock", {
  id: serial("id").primaryKey(),
  articleId: integer("article_id").references(() => articles.id).notNull(),
  type: mouvTypeEnum("type").notNull(),
  quantite: integer("quantite").notNull(),
  userId: integer("user_id").references(() => utilisateurs.id),
  motif: text("motif"),
  fournisseurId: integer("fournisseur_id").references(() => fournisseurs.id),
  prixAchat: numeric("prix_achat", { precision: 12, scale: 0 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => utilisateurs.id),
  action: varchar("action", { length: 100 }).notNull(),
  entite: varchar("entite", { length: 100 }),
  entiteId: integer("entite_id"),
  details: json("details"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const config = pgTable("config", {
  id: serial("id").primaryKey(),
  cle: varchar("cle", { length: 100 }).notNull().unique(),
  valeur: text("valeur"),
});
