import { pool } from "./index.js";

async function migrate() {
  const client = await pool.connect();
  try {
    console.log("Creating enums...");
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE role AS ENUM ('admin', 'gerant', 'caissier');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
      DO $$ BEGIN
        CREATE TYPE mouv_type AS ENUM ('entree', 'sortie', 'ajustement');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
      DO $$ BEGIN
        CREATE TYPE mode_paiement AS ENUM ('especes', 'momo', 'flooz', 'carte');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
      DO $$ BEGIN
        CREATE TYPE vente_statut AS ENUM ('validee', 'annulee');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);

    console.log("Creating tables...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        nom VARCHAR(100) NOT NULL,
        rayon VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS fournisseurs (
        id SERIAL PRIMARY KEY,
        nom VARCHAR(150) NOT NULL,
        contact VARCHAR(100),
        adresse TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS articles (
        id SERIAL PRIMARY KEY,
        nom VARCHAR(200) NOT NULL,
        categorie_id INTEGER REFERENCES categories(id),
        fournisseur_id INTEGER REFERENCES fournisseurs(id),
        prix_vente NUMERIC(12,0) NOT NULL,
        prix_achat NUMERIC(12,0),
        stock_actuel INTEGER NOT NULL DEFAULT 0,
        stock_minimum INTEGER NOT NULL DEFAULT 5,
        unite VARCHAR(30) DEFAULT 'unite',
        code_barre VARCHAR(50),
        code_qr TEXT,
        actif BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS utilisateurs (
        id SERIAL PRIMARY KEY,
        nom VARCHAR(100) NOT NULL,
        identifiant VARCHAR(50) NOT NULL UNIQUE,
        mot_de_passe_hash TEXT NOT NULL,
        role role NOT NULL DEFAULT 'caissier',
        actif BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES utilisateurs(id),
        token TEXT NOT NULL UNIQUE,
        ouverture TIMESTAMP DEFAULT NOW(),
        fermeture TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS ventes (
        id SERIAL PRIMARY KEY,
        caissier_id INTEGER REFERENCES utilisateurs(id),
        total_ttc NUMERIC(12,0) NOT NULL,
        mode_paiement mode_paiement NOT NULL DEFAULT 'especes',
        montant_recu NUMERIC(12,0),
        rendu_monnaie NUMERIC(12,0),
        statut vente_statut NOT NULL DEFAULT 'validee',
        motif_annulation TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS lignes_vente (
        id SERIAL PRIMARY KEY,
        vente_id INTEGER NOT NULL REFERENCES ventes(id),
        article_id INTEGER NOT NULL REFERENCES articles(id),
        quantite INTEGER NOT NULL,
        prix_unitaire NUMERIC(12,0) NOT NULL,
        sous_total NUMERIC(12,0) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS mouvements_stock (
        id SERIAL PRIMARY KEY,
        article_id INTEGER NOT NULL REFERENCES articles(id),
        type mouv_type NOT NULL,
        quantite INTEGER NOT NULL,
        user_id INTEGER REFERENCES utilisateurs(id),
        motif TEXT,
        fournisseur_id INTEGER REFERENCES fournisseurs(id),
        prix_achat NUMERIC(12,0),
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES utilisateurs(id),
        action VARCHAR(100) NOT NULL,
        entite VARCHAR(100),
        entite_id INTEGER,
        details JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS config (
        id SERIAL PRIMARY KEY,
        cle VARCHAR(100) NOT NULL UNIQUE,
        valeur TEXT
      );
    `);

    console.log("Migration completed successfully.");
  } finally {
    client.release();
  }
  await pool.end();
}

migrate().catch(console.error);
