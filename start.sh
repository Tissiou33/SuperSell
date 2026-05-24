#!/bin/bash
set -e

echo "=================================================="
echo "      Supermarché étoile du golfe — Démarrage Phase 1 MVP"
echo "=================================================="

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "❌  Docker n'est pas installé."
    echo "    Téléchargez Docker Desktop : https://www.docker.com/products/docker-desktop/"
    exit 1
fi

if ! docker compose version &> /dev/null 2>&1; then
    echo "❌  Docker Compose n'est pas disponible."
    exit 1
fi

echo "🔧  Construction et démarrage des conteneurs..."
docker compose up -d --build

echo ""
echo "⏳  Attente du démarrage de la base de données..."
sleep 8

echo "📦  Initialisation de la base de données..."
docker compose exec backend node dist/db/migrate.js 2>/dev/null || true
docker compose exec backend node dist/db/seed.js 2>/dev/null || true

echo ""
echo "✅  Supermarché étoile du golfe est prêt !"
echo ""
echo "  🌐  Application  : http://localhost:3000"
echo "  🔌  API Backend  : http://localhost:8081/api/health"
echo ""
echo "  Comptes de connexion :"
echo "  ┌─────────────┬──────────────┬───────────────┐"
echo "  │ Identifiant │ Mot de passe │ Rôle          │"
echo "  ├─────────────┼──────────────┼───────────────┤"
echo "  │ admin       │ admin123     │ Administrateur│"
echo "  │ gerant      │ gerant123    │ Gérant        │"
echo "  │ marie       │ caissier123  │ Caissière     │"
echo "  └─────────────┴──────────────┴───────────────┘"
echo ""
echo "  Pour arrêter : docker compose down"
echo "  Pour les logs: docker compose logs -f"
