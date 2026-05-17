# 📦 client_presta — Interface Vue 3 pour PrestaShop 8

[![Node Version](https://img.shields.io/badge/node-^20.19.0_||_≥22.12.0-brightgreen)](https://nodejs.org)
[![Vue Version](https://img.shields.io/badge/vue-^3.5.32-4FC08D)](https://vuejs.org)
[![Vite Version](https://img.shields.io/badge/vite-^8.0.8-646cff)](https://vitejs.dev)

---

## 🎯 Objectif du Projet

**client_presta** est une interface administrative moderne (Vue 3 + Vite) dédiée à la gestion d'une boutique PrestaShop 8.

- **Frontoffice** (`/front`) : Espace client avec catalogue produits, panier et historique commandes
- **Backoffice** (`/back`) : Espace administrateur avec gestion commandes, stock, analytics et outils décisionnels

**État :** ✅ v0.0.0 — Socle fonctionnel complètement implémenté (70% des features core)

---

## 🚀 Installation & Configuration

### Prérequis
- **Node.js** `^20.19.0` ou `>=22.12.0`
- **npm** ou **yarn** (npm recommandé)
- Une instance **PrestaShop 8** avec Webservice activé
- **Clé API PrestaShop** générée et configurée

### 1️⃣ Installation des Dépendances
```bash
# Clone du repository
cd /Users/mac/Documents/eval/J0/client_presta

# Installation npm
npm install
```

### 2️⃣ Configuration Environnement
Créer un fichier `.env.local` à la racine :

```bash
# URL de la base PrestaShop (défaut: http://localhost)
VITE_PRESTA_BASE_URL=http://localhost

# Clé API PrestaShop (32 caractères générés depuis le Back Office)
# Back Office → Paramètres avancés → Webservice → Ajouter une clé
VITE_PRESTA_API_KEY=YOUR_32_CHAR_API_KEY_HERE

# Force le proxy Vite pour contourner les erreurs CORS
VITE_PRESTA_USE_PROXY=true

# Active les logs détaillés de toutes les requêtes API
# À utiliser UNIQUEMENT en développement
VITE_PRESTA_DEBUG_API=true
```

### 3️⃣ Lancement du Serveur Développement
```bash
npm run dev
```

L'application démarre sur **http://localhost:5173** et proxifie les requêtes `/api` vers `VITE_PRESTA_BASE_URL`.

---

## 📋 Commandes Disponibles

| Commande | Description | Output |
|----------|-------------|--------|
| `npm run dev` | Lance Vite en mode développement | Serveur sur `http://localhost:5173` |
| `npm run build` | Compile l'application pour production | Répertoire `dist/` |
| `npm run preview` | Visualize le build production localement | Mode lecture lecture (`dist/`) |

---

## 🏗️ Architecture Générale

### Répertoire Source (`src/`)

```
src/
├── api/                          # Couche API & Services
│   ├── httpClient.js             # Transport HTTP (JSON/XML)
│   ├── resources/index.js        # Abstraction ressources PrestaShop
│   ├── stockService.js           # Gestion completé du stock
│   ├── useCart.js                # Logique panier (localStorage)
│   ├── useCheckout.js            # Logique validation commande
│   ├── useCustomerOrders.js      # Logique commandes client
│   ├── customerIdentity.js       # Infos profil client
│   └── import/                   # Services d'import CSV/ZIP
│       ├── asyncQueue.js         # ⭐ Queue asynchrone
│       ├── csvParser.js
│       ├── productsService.js
│       ├── customersService.js
│       ├── combinationsService.js
│       ├── stockAvailablesService.js
│       └── ...
│
├── components/                   # Composants Vue réutilisables
│   ├── backoffice/               # Composants administrateur
│   │   ├── orders/OrdersBackoffice.vue
│   │   ├── stock/StockManagementView.vue
│   │   ├── reset/ResetFront.vue
│   │   └── dashboard/
│   ├── front/                    # Composants frontoffice
│   │   └── product/
│   ├── ResourceCrud.vue          # CRUD générique (legacy)
│   └── ...
│
├── config/                       # Configuration centralisée
│   ├── resources.js              # Catalogue des ressources PrestaShop
│   │                             # (20+ endpoints configurés)
│   └── requiredFields.js         # Champs obligatoires par ressource
│
├── router/                       # Navigation Vue Router
│   └── index.js                  # Routes (+routes guards)
│
├── utils/                        # Fonctions utilitaires
│   ├── resourceData.js           # Parsing XML/JSON PrestaShop
│   ├── xmlUtils.js               # Manipulations XML
│   ├── stringUtils.js            # Transformations texte
│   ├── csv.js                    # Parsing CSV
│   └── asyncQueue.js             # Queue d'exécution asynchrone
│
├── views/                        # Pages principales
│   ├── Home.vue                  # Accueil
│   ├── front/                    # Frontoffice (pages client)
│   │   ├── FrontOfficeHome.vue
│   │   ├── FrontOfficeLogin.vue
│   │   ├── ProductCatalog.vue
│   │   ├── ProductDetailView.vue
│   │   ├── CartView.vue
│   │   ├── CheckoutView.vue
│   │   ├── OrdersView.vue        # Mes commandes client
│   │   └── OrderDetailView.vue
│   └── back/                     # Backoffice (pages admin)
│       ├── BackOfficeHome.vue
│       ├── BackOfficeLogin.vue
│       ├── DashboardView.vue     # Analytics
│       └── DataImportView.vue
│
├── experience/                   # Code legacy isolé
│   ├── components/
│   ├── views/admin/resources/    # Pages CRUD auto-générées
│   └── legacyAdminRoutes.js
│
├── assets/                       # Ressources statiques
│   ├── main.css
│   ├── base.css
│   └── ...
│
├── App.vue                       # Composant racine
├── main.js                       # Point d'entrée
└── vite.config.js               # Configuration build
```

### Routes Principales

#### Frontoffice (`/front/`)
```javascript
/front/login              // Sélection client ou mode anonyme
/front/products           // Catalogue produits avec filtres
/front/products/:id       // Détail produit + Galerie
/front/cart              // Panier récapitulatif
/front/checkout          // Validation & création commande
/front/orders            // Mes commandes (client connecté)
/front/orders/:id        // Détail commande
```

#### Backoffice (`/back/`)
```javascript
/back/login              // Authentification administrateur
/back                    // Accueil/Dashboard
/back/dashboard          // KPIs analytique (chiffre d'affaires, tendances)
/back/orders             // Gestion complète commandes + paniers
/back/stock              // Ajout stock + Historique mouvements
/back/import             // Import CSV (produits, clients, etc.)
/back/reset              // Réinitialisation données (DEV only)
```

---

## 🔑 Concepts Clés

### 1. Communication API — Trois Langages

L'API PrestaShop utilise trois formats selon l'opération :

**📖 LECTURE (GET) — JSON :**
```javascript
// Retourner en JSON pour faciliter le parsing côté client
const products = await fetch('/api/products?output_format=JSON')
```

**✍️ ÉCRITURE (POST/PUT/PATCH) — XML :**
```javascript
// PrestaShop requiert XML pour les créations/mises à jour
const xml = '<prestashop>...<product>...</product>...</prestashop>'
const response = await fetch('/api/products', {
  method: 'POST',
  headers: { 'Content-Type': 'application/xml' },
  body: xml
})
```

**🗑️ SUPPRESSION (DELETE) — Texte Brut :**
```javascript
// Réponse texte (logs d'erreur en cas d'échec)
await fetch('/api/orders/123', { method: 'DELETE' })
```

### 2. Filtrage API — Syntaxe Correcte

⚠️ **Erreur très courante** : Crochets autour valeur unique → HTTP 500 !

```javascript
// ✅ CORRECT — Pas de crochets pour valeur simple
filter[id_customer]=2

// ✅ CORRECT — Crochets pour plages/arrays
filter[id_product]=[1,10]

// ❌ INCORRECT — Crochets autour valeur unique (génère erreur 500)
filter[id_customer]=[2]  // ← NE PAS FAIRE

// ✅ CORRECT — Crochets pour display/sort
display=[id,name,price,total_paid]
sort=[date_add_DESC]
```

### 3. Proxy Vite + CORS

```javascript
// vite.config.js — Le proxy Vite redirige /api vers PrestaShop
proxy: {
  '/api': {
    target: process.env.VITE_PRESTA_BASE_URL || 'http://localhost',
    changeOrigin: true,
  }
}
```

| Scénario | Requête Client | Proxifiée vers |
|----------|---|---|
| Développement (proxy défaut) | `http://localhost:5173/api/products` | `http://localhost/api/products` |
| Développement (port custom) | `http://localhost:5173/api/products` | `http://localhost:8080/api/products` (si `VITE_PRESTA_BASE_URL=http://localhost:8080`) |
| Production | `https://domain.com/api/products` | Requête directe (pas de proxy) |

### 4. Gestion du Panier

Le panier est **géré localement** jusqu'à checkout pour maximiser la réactivité :

```javascript
// localStorage
localStorage['cart'] = JSON.stringify([
  { id_product: 1, quantity: 2, price: 99.99, ... },
  { id_product: 5, quantity: 1, price: 49.99, ... }
])

// Pas de synchronisation API jusqu'à la validation
// → À checkout, création du panier + commande d'un seul coup
```

### 5. Stock — Points Critiques

⚠️ Le stock utilise des champs non-intuitifs — voir `STOCK_MANAGEMENT.md` :

```javascript
// ❌ MAUVAIS
physical_quantity  // ← C'est LE BON champ pour le stock

// ⚠️ Confusion fréquente
quantity     // ← Ceci n'existe PAS dans stock_movements !
sign         // ← Direction : 1=entrée, -1=sortie (OBLIGATOIRE)
id_stock     // ← ID du stock (pas id_product!) — voir GET /api/stocks
```

---

## 🧪 Configuration Double API

### Authentification Frontoffice

```javascript
// Sélection client ou mode anonyme
sessionStorage['customerId'] = 2        // ou 0 (anonyme)
sessionStorage['customerEmail'] = email

// → Pas de mot de passe (test/démo)
```

### Authentification Backoffice

```javascript
// Email + mot de passe simples
sessionStorage['isAdminLoggedIn'] = 'true'
sessionStorage['adminEmail'] = email

// Credentials défaut (développement)
// Email: admin@example.com
// Mot de passe: admin123
```

---

## 📊 Statut d'Implémentation

### ✅ Fonctionnalités Complétées (Jour 1-3)

| Feature | Composant | Status |
|---------|-----------|--------|
| **Catalog Produits** | ProductCatalog.vue | ✅ Complète |
| **Détail Produit** | ProductDetailView.vue | ✅ Complète |
| **Panier Local** | CartView.vue | ✅ Complète |
| **Checkout & Commande** | CheckoutView.vue | ✅ Complète |
| **Mes Commandes (Client)** | OrdersView.vue | ✅ Complète |
| **Détail Commande (Client)** | OrderDetailView.vue | ✅ Complète |
| **Gestion Commandes (Admin)** | OrdersBackoffice.vue | ✅ Complète |
| **Dashboard KPIs** | DashboardView.vue | ✅ Complète |
| **Stock Management** | StockManagementView.vue | ✅ Complète |
| **Historique Stock** | StockTrendChart.vue | ✅ Complète |
| **Reset Données** | ResetFront.vue | ✅ Complète |
| **Authentification** | BackOfficeLogin.vue | ✅ Complète |

### ⏳ Fonctionnalités Futures (Roadmap)

| Feature | Statut | Notes |
|---------|--------|-------|
| Import CSV/ZIP | ✅ Complète | Services + Page prête |
| Recherche multicritères | ⏳ Partielle | Filtrage côté API implémenté |
| Badges HOT/NEW | ✅ Complète | Logique date_add/available_date |
| OAuth2 PrestaShop | ⏳ Non implémenté | Roadmap sécurité |
| JWT Tokens | ⏳ Non implémenté | Optionnel si backend custom |

---

## 🐛 Dépannage Courant

### Erreur 500 — "Unable to filter by this field"

**Cause :** Syntaxe de filtre incorrecte (crochets autour valeur unique)

```bash
# ❌ INCORRECT
?filter[id_customer]=[2]

# ✅ CORRECT
?filter[id_customer]=2
```

### CORS bloqué au démarrage

**Cause :** Le proxy Vite ne fonctionne pas (pas configuré ou port incorrect)

**Solutions :**
1. Vérifier `.env.local` : `VITE_PRESTA_BASE_URL=http://localhost` (ou port custom)
2. Redémarrer le serveur Vite : `npm run dev`
3. Vérifier dans les DevTools que les requêtes `/api` sont bien proxifiées

### Panier ne persiste pas

**Cause :** localStorage désactivé dans le navigateur

**Solution :** Accepter les cookies localStorage (Privacy settings → Cookies)

### Commande ne se crée pas

**Cause :** Secure Key manquante ou données incomplètes

**Vérifier :**
- `id_cart` est fourni dans le payload
- `secure_key` est incluse
- `id_address_delivery` et `id_address_invoice` sont valides
- Consulter logs console : `VITE_PRESTA_DEBUG_API=true`

---

## 📚 Documentation Complète

Pour une documentation technique exhaustive, consulter :

- **`DOCUMENTATION_PROJET.md`** — Architecture complète, workflows détaillés, patterns
- **`STOCK_MANAGEMENT.md`** — Guide complet gestion du stock
- **`RESUME_STOCK.md`** — Résumé implémentation stock
- **`documentation_maj.md`** — Référence API PrestaShop 8/9 complète
- **`AGENTS.md`** — État du projet et checklist tâches

---

## 🔐 Sécurité

### En Développement
- ✅ Basic Auth + Clé API PrestaShop
- ✅ SessionStorage pour sessions client/admin
- ⚠️ Credentials pré-remplis (test uniquement)

### En Production
- [ ] HTTPS obligatoire (`https://domain.com`)
- [ ] Clé API stockée en variable d'environnement serveur (pas en dur)
- [ ] CORS configuré côté PrestaShop
- [ ] Rate limiting (optionnel)
- [ ] Validation input côté client
- [ ] OAuth2 ou JWT (recommandé)

---

## 📦 Structure Build

### Production
```bash
npm run build
```

Génère un répertoire `dist/` prêt pour déploiement :
- `index.html` — Point d'entrée
- `assets/` — Bundles JS/CSS minifiés
- `favicon.ico` — Icône

**Déploiement :** Copier le contenu `dist/` sur serveur web (nginx, Apache, etc.)

---

## 🛠️ Stack Technologique

| Outil | Version | Rôle |
|-------|---------|------|
| Vue | ^3.5.32 | Framework UI (Composition API + <script setup>) |
| Vue Router | ^4.5.0 | Navigation & Route Guards |
| Vite | ^8.0.8 | Bundler & Dev Server |
| Vite Vue DevTools | ^8.1.1 | Vue DevTools intégrés |
| Node | ^20.19.0 \\|\| >=22.12.0 | Runtime JavaScript |

---

## 📞 Support & Contact

Pour toute question ou bug :

1. Vérifier les logs console avec `VITE_PRESTA_DEBUG_API=true`
2. Consulter la documentation : `DOCUMENTATION_PROJET.md`
3. Tester l'API directement via curl
4. Vérifier les permissions de la clé API PrestaShop

---

## 📜 Licence

Ce projet est fourni à titre informatif pour l'évaluation P17.

---

**Dernière mise à jour : 17 mai 2026**  
**Version : 0.0.0 (Développement)**  
**Auteur : Équipe Développement P17**
