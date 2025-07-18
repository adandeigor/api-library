# Documentation des API REST – Projet Library Backend

## Table des matières
- [Authentification](#authentification)
- [Utilisateurs](#utilisateurs)
- [Bibliothèques](#bibliothèques)
- [Livres](#livres)
- [Gestion des managers](#gestion-des-managers)

---

## Authentification

### POST `/api/auth/login`
**Description :** Connexion d'un utilisateur.
- **Body :**
```json
{
  "email": "string",
  "password": "string"
}
```
- **Réponse 200 :**
```json
{
  "message": "Connexion réussie",
  "token": "...",
  "actualUser": { "userId": 1, "role": "ADMIN" }
}
```
- **Erreurs :** 400, 401, 404

### POST `/api/auth/logout`
**Description :** Déconnexion de l'utilisateur (suppression du cookie d'authentification).
- **Réponse 200 :** `{ "message": "Déconnexion réussie" }`

### POST `/api/auth/register`
**Description :** Inscription d'un nouvel utilisateur.
- **Body :**
```json
{
  "email": "string",
  "password": "string",
  "firstName": "string",
  "lastName": "string",
  "phone": "string",
  "role": "ADMIN|MANAGER|CLIENT|DELIVERY"
}
```
- **Réponse 201 :** `{ "message": "Utilisateur créé avec succès" }`
- **Erreurs :** 400, 500

---

## Utilisateurs

### GET `/api/users`
**Description :** Liste paginée des utilisateurs (filtrage possible par nom, email, rôle, bibliothèque).
- **Query params :** `page`, `perPage`, `search`, `role`
- **Headers requis :** `x-user-role`, `x-user-library-id` (pour MANAGER)
- **Réponse 200 :**
```json
{
  "users": [ { "id": 1, "email": "...", "firstName": "...", "lastName": "...", "role": "...", "library": { "id": 1, "name": "..." }, "lastConnected": "..." } ],
  "total": 100,
  "page": 1,
  "perPage": 10,
  "totalPages": 10
}
```

### PATCH `/api/users/[id]`
**Description :** Modifier un utilisateur (soi-même ou, pour ADMIN, n'importe qui).
- **Headers requis :** `x-user-id`, `x-user-role`
- **Body :** Champs modifiables (`firstName`, `lastName`, `email`, `phone`, `password`, `role`, `libraryId`)
- **Réponse 200 :** Utilisateur modifié
- **Erreurs :** 400, 401, 403, 404, 409

### DELETE `/api/users/[id]`
**Description :** Supprimer un utilisateur (ADMIN uniquement, sauf soi-même).
- **Headers requis :** `x-user-id`, `x-user-role`
- **Réponse 200 :** `{ "success": true, "message": "Utilisateur supprimé avec succès" }`
- **Erreurs :** 400, 401, 403, 404

### GET `/api/users/me`
**Description :** Récupérer les informations de l'utilisateur courant (via cookie `auth-token`).
- **Réponse 200 :**
```json
{
  "id": 1,
  "email": "...",
  "firstName": "...",
  "lastName": "...",
  "phone": "...",
  "role": "...",
  "library": { "id": 1, "name": "...", "address": "..." },
  "lastConnected": "...",
  "addresses": [ ... ],
  "loans": [ ... ],
  "reservations": [ ... ]
}
```

---

## Bibliothèques

### Structure d'une bibliothèque
```json
{
  "id": 1,
  "name": "...",
  "address": "...",
  "contact": "...",
  "ifu": "https://.../ifu.png", // Lien image IFU
  "rccm": "https://.../rccm.png", // Lien image RCCM
  "status": "PENDING|VALIDATED|REJECTED",
  "rejectionReason": "...", // Raison du rejet si REJECTED
  "createdAt": "...",
  "updatedAt": "..."
}
```

### GET `/api/libraries`
**Description :** Liste paginée des bibliothèques.
- **Query params :** `search`, `page`, `limit`
- **Réponse 200 :**
```json
{
  "data": [ { ...bibliothèque... } ],
  "pagination": { "total": 1, "page": 1, "limit": 20, "totalPages": 1 }
}
```

### POST `/api/libraries`
**Description :** Créer une bibliothèque
- **Headers requis :** `x-user-id`, `x-user-role`
- **Body :**
```json
{
  "name": "...",
  "address": "...",
  "contact": "...",
  "ifu": "https://.../ifu.png", // Lien image IFU
  "rccm": "https://.../rccm.png" // Lien image RCCM
}
```
- **Réponse 201 :** `{ "success": true, "message": "Bibliothèque créée avec succès", "library": { ... } }`
- **Note :** Le status sera toujours `PENDING` à la création.

### PATCH `/api/libraries/[libraryId]`
**Description :** Modifier une bibliothèque ( MANAGER de la bibliothèque).
- **Headers requis :** `x-user-id`, `x-user-role`, `x-user-library-id`
- **Body :**
  - Champs modifiables : `name`, `address`, `contact`, `ifu`, `rccm`
  - Seul un ADMIN peut modifier `status` et `rejectionReason`.
  - Si `status` est mis à `REJECTED`, le champ `rejectionReason` est **obligatoire**.
  - Si `status` est mis à `VALIDATED` ou `PENDING`, `rejectionReason` est ignoré ou remis à `null`.
- **Exemple pour valider :**
```json
{
  "status": "VALIDATED"
}
```
- **Exemple pour rejeter :**
```json
{
  "status": "REJECTED",
  "rejectionReason": "Document IFU illisible"
}
```
- **Réponse 200 :** Bibliothèque modifiée
- **Erreurs :** 400, 401, 403, 404

### GET `/api/libraries/[libraryId]`
**Description :** Détail d'une bibliothèque.
- **Réponse 200 :** `{ ...bibliothèque... }`

### DELETE `/api/libraries/[libraryId]`
**Description :** Supprimer une bibliothèque (ADMIN uniquement, si pas de livres ni d'utilisateurs).
- **Headers requis :** `x-user-id`, `x-user-role`
- **Réponse 200 :** `{ "success": true, "message": "Bibliothèque supprimée" }`

#### ⚠️ Règle métier :
- Tant que `status` n'est pas `VALIDATED`, la bibliothèque ne peut pas être utilisée (pas de livres, pas de catalogue, pas d'affichage dans les fils d'actualité, etc.).

---

## Livres

### GET `/api/books`
**Description :** Liste paginée des livres (filtrage par titre, auteur, catégorie, bibliothèque).
- **Query params :** `search`, `limit`, `page`
- **Headers requis :** `x-user-role`, `x-user-library-id` (pour MANAGER)
- **Réponse 200 :**
```json
{
  "data": [ { "id": 1, "title": "...", "coverUrl": "...", "status": "AVAILABLE", "author": "...", "category": "...", "categoryColor": "...", "library": "..." } ],
  "pagination": { "total": 1, "page": 1, "limit": 20, "totalPages": 1 }
}
```

### POST `/api/books`
**Description :** Créer un livre (ADMIN ou MANAGER, dans sa bibliothèque).
- **Headers requis :** `x-user-id`, `x-user-role`, `x-user-library-id`
- **Body :** `{ "title": "...", "authorId": 1, "categoryId": 1, "libraryId": 1, ... }`
- **Réponse 201 :** `{ "success": true, "message": "Livre créé avec succès", "book": { ... } }`
- **Note :** Impossible d'ajouter un livre si la bibliothèque n'est pas `VALIDATED`.

### GET `/api/libraries/[libraryId]/books`
**Description :** Liste paginée des livres d'une bibliothèque.
- **Query params :** `search`, `limit`, `page`
- **Réponse 200 :**
```json
{
  "data": [ { "id": 1, "title": "...", "coverUrl": "...", "summary": "...", "status": "AVAILABLE", "author": "...", "category": "...", "categoryColor": "..." } ],
  "pagination": { "total": 1, "page": 1, "limit": 20, "totalPages": 1 }
}
```

---

## Gestion des managers

### POST `/api/libraries/[libraryId]/managers`
**Description :** Associer un manager à une bibliothèque (ADMIN uniquement).
- **Headers requis :** `x-user-id`, `x-user-role`
- **Body :** `{ "userId": 1 }`
- **Réponse 200 :** `{ "success": true, "message": "Manager associé avec succès", "user": { ... } }`

### GET `/api/libraries/[libraryId]/managers`
**Description :** Liste des managers d'une bibliothèque (ADMIN ou MANAGER de la bibliothèque).
- **Headers requis :** `x-user-role`, `x-user-library-id`
- **Réponse 200 :** `[ { "id": 1, "email": "...", "firstName": "...", "lastName": "...", "lastConnected": "..." } ]`

### GET `/api/libraries/[libraryId]/managers/[userId]`
**Description :** Détail d'un manager d'une bibliothèque (ADMIN ou MANAGER de la bibliothèque).
- **Headers requis :** `x-user-id`, `x-user-role`, `x-user-library-id`
- **Réponse 200 :** `{ "id": 1, "email": "...", "firstName": "...", "lastName": "...", "lastConnected": "...", "createdAt": "..." }`

### DELETE `/api/libraries/[libraryId]/managers/[userId]`
**Description :** Dissocier un manager d'une bibliothèque (ADMIN uniquement).
- **Headers requis :** `x-user-id`, `x-user-role`
- **Réponse 200 :** `{ "success": true, "message": "Manager dissocié de la bibliothèque" }`

---

## Notes générales
- Tous les endpoints attendent et renvoient du JSON.
- Les statuts HTTP sont utilisés pour indiquer le succès ou l'échec (200, 201, 400, 401, 403, 404, 409, 500).
- L'authentification se fait via un token JWT stocké dans un cookie `auth-token`.
- Certains endpoints nécessitent des headers spécifiques pour l'autorisation.
- Les routes `/logs` et `/notifications` ne sont pas implémentées.

---

*Documentation générée automatiquement à partir du code source.* 