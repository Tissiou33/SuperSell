import { pool } from "./index.js";
import bcrypt from "bcryptjs";

async function seed() {
  const client = await pool.connect();
  try {
    // Config defaults
    await client.query(`
      INSERT INTO config (cle, valeur) VALUES
        ('nom_magasin', 'Supermarché étoile du golfe'),
        ('tva_taux', '18'),
        ('devise', 'FCFA'),
        ('stock_alerte_actif', 'true')
      ON CONFLICT (cle) DO NOTHING;
    `);

    // Default categories
    await client.query(`
      INSERT INTO categories (nom, rayon) VALUES
        ('Alimentation générale', 'Alimentation'),
        ('Boissons', 'Boissons'),
        ('Parfums & Cosmétiques', 'Parfums'),
        ('Équipements électriques', 'Électrique'),
        ('Divers', 'Autres')
      ON CONFLICT DO NOTHING;
    `);

    // Admin user
    const hash = await bcrypt.hash("admin123", 12);
    await client.query(`
      INSERT INTO utilisateurs (nom, identifiant, mot_de_passe_hash, role)
      VALUES ('Administrateur', 'admin', $1, 'admin')
      ON CONFLICT (identifiant) DO NOTHING;
    `, [hash]);

    // Gerant user
    const hashGerant = await bcrypt.hash("gerant123", 12);
    await client.query(`
      INSERT INTO utilisateurs (nom, identifiant, mot_de_passe_hash, role)
      VALUES ('Gérant Principal', 'gerant', $1, 'gerant')
      ON CONFLICT (identifiant) DO NOTHING;
    `, [hashGerant]);

    // Caissier user
    const hashCaissier = await bcrypt.hash("caissier123", 12);
    await client.query(`
      INSERT INTO utilisateurs (nom, identifiant, mot_de_passe_hash, role)
      VALUES ('Caissière Marie', 'marie', $1, 'caissier')
      ON CONFLICT (identifiant) DO NOTHING;
    `, [hashCaissier]);

    // Sample articles
    await client.query(`
      INSERT INTO articles (nom, categorie_id, prix_vente, prix_achat, stock_actuel, stock_minimum, unite, code_barre)
      VALUES
        ('Riz local 1kg', 1, 500, 350, 100, 20, 'kg', '6001001001001'),
        ('Huile de palme 1L', 1, 1200, 900, 50, 10, 'litre', '6001001002001'),
        ('Sucre 1kg', 1, 750, 550, 80, 15, 'kg', '6001001003001'),
        ('Eau minérale 1.5L', 2, 400, 280, 120, 30, 'bouteille', '6001002001001'),
        ('Coca-Cola 33cl', 2, 500, 350, 60, 12, 'canette', '6001002002001'),
        ('Savon de toilette', 3, 350, 220, 40, 10, 'unité', '6001003001001'),
        ('Ampoule LED 9W', 4, 1500, 1000, 25, 5, 'unité', '6001004001001'),
        ('Farine de blé 1kg', 1, 600, 420, 70, 15, 'kg', '6001001004001')
      ON CONFLICT DO NOTHING;
    `);

    console.log("Seeding completed.");
    console.log("Users: admin/admin123, gerant/gerant123, marie/caissier123");
  } finally {
    client.release();
  }
  await pool.end();
}

seed().catch(console.error);
