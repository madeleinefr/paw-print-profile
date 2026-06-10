# PawPrint Frontend — Source Overview

## Folder Structure

```
src/
├── api/          → HTTP client wrapper (typed requests, error handling, auth headers)
├── auth/         → Authentication context, token storage, route guards
├── components/   → Shared UI components (e.g., ImageUpload)
├── layout/       → App shell / page layout (AppLayout with nav + outlet)
├── pages/        → Route-level page components
│   ├── owner/    → Pet owner pages (dashboard, pet detail, claim, settings)
│   ├── vet/      → Veterinarian pages (dashboard, pet list, create profile, clinic)
│   └── public/   → Unauthenticated pages (pet search detail, care snapshot, contact)
├── tests/        → Integration tests
├── App.tsx       → Route definitions and provider setup
└── main.tsx      → Vite entry point
```

## Routing Strategy

Routes are role-based and protected by `RouteGuard`:

| Prefix      | Role Required | Examples                              |
|-------------|---------------|---------------------------------------|
| `/vet/*`    | `vet`         | Dashboard, pet CRUD, clinic settings  |
| `/owner/*`  | `owner`       | Dashboard, claim profile, pet detail  |
| `/search`   | none          | Public lost-pet search                |
| `/care`     | none          | Time-limited care snapshot access     |
| `/contact`  | none          | Anonymous owner contact form          |
| `/login`    | none          | Login / signup                        |

Default route (`/`) redirects to `/search`.

## Key Technologies

- **React 18** with functional components and hooks
- **Vite** for dev server and production bundling
- **TypeScript** for type safety across all components
- **react-router-dom v6** for declarative routing with nested layouts
- **lucide-react** for iconography
- **Custom API client** (`api/client.ts`) with typed generics and token injection

## Authentication Flow

1. **AuthContext** (`auth/AuthContext.tsx`) — React context providing `isAuthenticated`, `userRole`, `userId`, `clinicId`, `email`, plus `signIn`/`signUp`/`logout` methods.
2. **token-storage** (`auth/token-storage.ts`) — Persists JWT + user metadata in `localStorage`.
3. **RouteGuard** (`auth/RouteGuard.tsx`) — Wraps protected route groups; redirects unauthenticated or unauthorized users to `/login`.
4. **API client** (`api/client.ts`) — Attaches `Authorization: Bearer <token>` header to all authenticated requests automatically.

Login flow: credentials → backend `/auth/signin` → JWT returned → stored via token-storage → AuthContext updates → RouteGuard permits access.
