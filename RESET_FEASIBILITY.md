# Rapport de faisabilité des endpoints à réinitialiser

## Vérification DELETE disponible sur chaque endpoint

### Fichier 1 : Catalogue produits
- ✅ **products** — DELETE disponible
- ✅ **tax_rule_groups** — DELETE disponible
- ✅ **tax_rules** — DELETE disponible
- ✅ **taxes** — DELETE disponible
- ✅ **categories** — DELETE disponible

### Fichier 2 : Variations produits
- ✅ **combinations** — DELETE disponible
- ✅ **product_options** — DELETE disponible
- ✅ **product_option_values** — DELETE disponible

### Fichier 3 : Commandes & Clients
- ✅ **customers** — DELETE disponible
- ✅ **carts** — DELETE disponible
- ✅ **orders** — DELETE disponible
- ✅ **order_details** — DELETE disponible
- ✅ **order_histories** — DELETE disponible
- ✅ **order_invoices** — DELETE disponible
- ✅ **order_payments** — DELETE disponible
- ✅ **order_slip** — DELETE disponible
- ❌ **order_states** — DELETE NON disponible **(table de référence, lecture seule)**
- ✅ **order_cart_rules** — DELETE disponible
- ✅ **order_carriers** — DELETE disponible

## Résumé
- **Total vérifié :** 20 endpoints
- **DELETE disponible :** 19 endpoints ✅
- **DELETE indisponible :** 1 endpoint ❌ (order_states)

## Notes
- `order_states` est une table de référence (les statuts disponibles) et n'est pas conçue pour être supprimée.
- Tous les autres endpoints supportent DELETE et peuvent être réinitialisés sans problème.
- L'ordre de suppression recommandé : d'abord les commandes (orders et dérivées), puis clients, puis produits/catégories.

