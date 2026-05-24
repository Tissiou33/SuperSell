# SUPERSELLS — Supermarché étoile du golfe (Phase 1 MVP)

Solution PWA complète pour 1 poste, versionnée sur GitHub dans le dépôt `SUPERSELLS`.

---

## Prérequis

- **Docker Desktop** installé et en cours d'exécution
- Windows 10/11, macOS ou Linux
- 8 Go RAM minimum, 4 cœurs CPU, 20 Go disque libre

---

## Démarrage rapide

```bash
# 1. Lancer Supermarché étoile du golfe
./start.sh          # Linux/macOS
# ou double-cliquez sur start.sh sous Windows Git Bash

# 2. Ouvrir dans le navigateur
# http://localhost:3000
```

### Dépôt GitHub

- Nom du dépôt : **SUPERSELLS**
- URL attendue : `https://github.com/<votre-utilisateur>/SUPERSELLS`

Après création du dépôt distant, poussez le code avec :

```bash
git remote add origin https://github.com/<votre-utilisateur>/SUPERSELLS.git
git branch -M main
git push -u origin main
```

### Comptes de connexion

| Identifiant | Mot de passe | Rôle          |
|-------------|-------------|---------------|
| admin       | admin123    | Administrateur |
| gerant      | gerant123   | Gérant         |
| marie       | caissier123 | Caissière      |

---

## Architecture technique

```
shopdesk/
├── docker-compose.yml      ← Orchestration Docker (1 commande)
├── start.sh                ← Script de démarrage
├── stop.sh                 ← Script d'arrêt
├── backend/                ← API REST Node.js + Express
│   ├── src/
│   │   ├── routes/         ← Endpoints API
│   │   │   ├── auth.ts     → /api/auth/*
│   │   │   ├── articles.ts → /api/articles/*
│   │   │   ├── ventes.ts   → /api/ventes/*
│   │   │   ├── stocks.ts   → /api/stocks/*
│   │   │   ├── rapports.ts → /api/rapports/*
│   │   │   └── utilisateurs.ts → /api/utilisateurs/*
│   │   ├── db/
│   │   │   ├── schema.ts   ← Schéma Drizzle ORM
│   │   │   ├── migrate.ts  ← Création des tables
│   │   │   └── seed.ts     ← Données initiales
│   │   └── middleware/
│   │       └── auth.ts     ← JWT + audit logs
│   └── Dockerfile
└── frontend/               ← React 18 + Vite PWA TypeScript
    ├── src/
    │   ├── pages/
    │   │   ├── Login.tsx       ← Écran de connexion
    │   │   ├── Dashboard.tsx   ← Tableau de bord (gérant/admin)
    │   │   ├── Caisse.tsx      ← Interface POS (scan, panier, paiement)
    │   │   ├── Catalogue.tsx   ← Gestion articles + QR codes
    │   │   ├── Stocks.tsx      ← Stocks, alertes, réappro, historique
    │   │   ├── Rapports.tsx    ← Rapports PDF/Excel + graphiques
    │   │   └── Parametres.tsx  ← Utilisateurs + configuration
    │   ├── components/
    │   │   └── Layout.tsx      ← Sidebar + navigation
    │   ├── store/
    │   │   └── auth.ts         ← Zustand (état d'authentification)
    │   └── lib/
    │       └── api.ts          ← Axios client + intercepteurs JWT
    ├── nginx.conf
    └── Dockerfile
```

---

## Fonctionnalités Phase 1 (MVP)

### ✅ Authentification
- 3 rôles : Administrateur, Gérant, Caissier
- JWT avec session active en base
- Permissions granulaires par route et par écran

### ✅ Catalogue articles
- Fiche complète (nom, catégorie, prix vente/achat, stock min, unité, fournisseur)
- Génération QR Code automatique à la création
- Code-barres EAN-13 configurable
- Recherche + filtres par catégorie et alerte stock
- Désactivation douce (soft delete)

### ✅ Interface Caisse (POS)
- Scan USB HID (entrée clavier directe) → article trouvé en <500ms
- Recherche manuelle par nom
- Panier temps réel (ajout/modification/suppression)
- 4 modes de paiement : Espèces, MoMo, Flooz, Carte
- Calcul automatique du rendu monnaie en FCFA
- Modale de reçu post-validation
- Annulation de vente (caissier avant validation, gérant après)

### ✅ Gestion des stocks
- Décrémentation automatique à chaque vente validée
- Alertes visuelles (stock ≤ minimum)
- Réapprovisionnement avec fournisseur et prix d'achat
- Ajustement manuel justifié (gérant uniquement, tracé en audit)
- Historique complet des mouvements

### ✅ Rapports & Analyses
- Tableau de bord : CA du jour, panier moyen, top articles
- Graphiques : CA par jour (BarChart), répartition paiements (PieChart), tendances
- Journal des ventes filtrable par période
- Export **PDF** (rapport complet avec graphiques textuels)
- Export **Excel** (ventes + stock sur 2 feuilles)

### ✅ Paramètres (Admin)
- CRUD utilisateurs avec gestion des rôles
- Configuration générale (nom magasin, TVA, devise)
- Catégories et fournisseurs

---

## API REST — Endpoints principaux

```
POST   /api/auth/login              → Connexion
POST   /api/auth/logout             → Déconnexion
GET    /api/auth/me                 → Utilisateur courant

GET    /api/articles                → Liste articles (search, categorie, alerte)
GET    /api/articles/scan/:code     → Scan code-barres/QR
POST   /api/articles                → Créer article
PUT    /api/articles/:id            → Modifier article

POST   /api/ventes                  → Valider une vente
GET    /api/ventes                  → Liste des ventes
PATCH  /api/ventes/:id/annuler      → Annuler une vente

GET    /api/stocks/alertes          → Articles en alerte
POST   /api/stocks/entree           → Réapprovisionnement
POST   /api/stocks/ajustement       → Ajustement manuel
GET    /api/stocks/mouvements       → Historique mouvements

GET    /api/rapports/dashboard      → Stats temps réel
GET    /api/rapports/pdf            → Export rapport PDF
GET    /api/rapports/excel          → Export rapport Excel

GET    /api/utilisateurs            → Liste utilisateurs
POST   /api/utilisateurs            → Créer utilisateur
GET    /api/utilisateurs/categories → Catégories
GET    /api/utilisateurs/config     → Configuration
```

---

## Modèle de données

```sql
categories       (id, nom, rayon)
fournisseurs     (id, nom, contact, adresse)
articles         (id, nom, categorie_id, fournisseur_id, prix_vente, prix_achat,
                  stock_actuel, stock_minimum, unite, code_barre, code_qr, actif)
utilisateurs     (id, nom, identifiant, mot_de_passe_hash, role, actif)
sessions         (id, user_id, token, ouverture, fermeture)
ventes           (id, caissier_id, total_ttc, mode_paiement, montant_recu,
                  rendu_monnaie, statut, motif_annulation)
lignes_vente     (id, vente_id, article_id, quantite, prix_unitaire, sous_total)
mouvements_stock (id, article_id, type, quantite, user_id, fournisseur_id,
                  prix_achat, motif)
audit_logs       (id, user_id, action, entite, entite_id, details)
config           (id, cle, valeur)
```

---

## Commandes utiles

```bash
# Voir les logs en temps réel
docker compose logs -f

# Redémarrer uniquement le backend
docker compose restart backend

# Ouvrir un shell PostgreSQL
docker compose exec postgres psql -U shopdesk -d shopdesk

# Réinitialiser la base (⚠ efface tout)
docker compose down -v && ./start.sh

# Vérifier l'état des services
docker compose ps
```

---

## Évolution vers Phase 2 (Multi-postes)

L'architecture est déjà prête pour 2-3 postes en réseau local :
- Chaque poste accède à `http://IP_SERVEUR:3000`
- Même Docker Compose, aucune modification requise
- Seul prérequis : ouvrir les ports 3000 et 8080 dans le pare-feu Windows

---

*Supermarché étoile du golfe v1.0 — Phase MVP — 18 mai 2026*
