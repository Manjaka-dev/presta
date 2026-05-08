# client_presta

Interface d'administration Vue 3 pour le Webservice PrestaShop 8.

## Configuration

Creer un fichier `.env.local` a la racine (voir `.env.example`).

- En dev, si le navigateur bloque par CORS, utilisez le proxy Vite : laissez `VITE_PRESTA_BASE_URL=` vide
  ou forcez `VITE_PRESTA_USE_PROXY=true`.

## Installation

```sh
npm install
```

## Lancer en dev

```sh
npm run dev
```

## Build

```sh
npm run build
```

## Structure

- `src/config/resources.js` : catalogue des ressources et routes admin.
- `src/api/` : appels API (JSON en lecture, XML en ecriture).
- `src/views/admin/resources/` : pages CRUD par ressource.
- `src/components/ResourceCrud.vue` : UI CRUD partagee.

## Outils

- CSV import: `/admin/tools/import-csv`
- Reset data: `/admin/tools/reset-data`
