import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { UserRole } from './app/generated/prisma';

interface DecodedUser {
  id: number;
  role: UserRole;
  library?: number;
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const method = request.method;
  const token = request.cookies.get('auth-token')?.value;

  // Routes publiques
  const publicRoutes = ['/api/auth/login', '/api/auth/register', '/api/auth/logout'];
  if (publicRoutes.includes(path)) {
    return NextResponse.next();
  }

  // Vérification du token
  if (!token || token.trim() === '') {
    return new NextResponse(
      JSON.stringify({ error: 'Authentification requise' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const user = await verifyToken(token) as DecodedUser | null;
    if (!user || !user.id || !user.role) {
      throw new Error('Utilisateur invalide');
    }

    // Validation du rôle
    const validRoles = Object.values(UserRole) as string[];
    if (!validRoles.includes(user.role)) {
      throw new Error('Rôle utilisateur invalide');
    }

    // Attachement des infos utilisateur
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-user-id', user.id.toString());
    requestHeaders.set('x-user-role', user.role);
    if (user.library) {
      requestHeaders.set('x-user-library-id', user.library.toString());
    }

    // Gestion spéciale des routes utilisateurs
    if (path.startsWith('/api/users/')) {
      const segments = path.split('/');
      const userIdInPath = segments[segments.length - 1];

      // Autoriser l'accès si:
      // 1. Route 'me' OU
      // 2. Même ID que l'utilisateur OU
      // 3. Rôle ADMIN
      const isSelfAccess =
        userIdInPath === 'me' ||
        userIdInPath === user.id.toString() ||
        user.role === UserRole.ADMIN;

      if (!isSelfAccess) {
        return new NextResponse(
          JSON.stringify({
            error: 'Accès refusé',
            message: 'Vous ne pouvez accéder qu\'à vos propres données',
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Forcer le paramètre à l'ID réel pour les routes 'me'
      if (userIdInPath === 'me') {
        requestHeaders.set('x-requested-user-id', user.id.toString());
      }
    }

    // Vérification globale des permissions
    if (!hasPermission(user.role, path, method)) {
      return new NextResponse(
        JSON.stringify({
          error: 'Permissions insuffisantes',
          message: 'Votre rôle ne vous permet pas d\'effectuer cette action',
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return NextResponse.next({
      headers: requestHeaders,
    });
  } catch (error: any) {
    const message =
      error.message === 'Utilisateur invalide'
        ? 'Utilisateur invalide'
        : 'Token invalide ou erreur serveur';
    return new NextResponse(
      JSON.stringify({ error: message }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// Permissions simplifiées et plus explicites
function hasPermission(role: UserRole, path: string, method: string): boolean {
  const permissions: Record<UserRole, { path: string; methods?: string[] }[]> = {
    [UserRole.ADMIN]: [
      { path: '/api/users', methods: ['GET', 'POST', 'PATCH', 'DELETE'] },
      { path: '/api/users/me', methods: ['GET', 'PATCH'] },
      { path: '/api/users/[id]', methods: ['GET', 'PATCH', 'DELETE'] },
      { path: '/api/libraries', methods: ['GET', 'POST', 'PATCH', 'DELETE'] },
      { path: '/api/libraries/[library]', methods: ['GET', 'PATCH', 'DELETE'] },
      { path: '/api/libraries/[library]/managers', methods: ['GET', 'POST'] },
      { path: '/api/libraries/[library]/managers/[userId]', methods: ['GET', 'DELETE'] },
      { path: '/api/libraries/[library]/books', methods: ['GET'] },
      { path: '/api/books', methods: ['GET', 'POST', 'PATCH', 'DELETE'] },
      { path: '/api/books/[book]', methods: ['GET', 'PATCH', 'DELETE'] },
      { path: '/api/loans', methods: ['GET', 'POST', 'PATCH', 'DELETE'] },
      { path: '/api/reservations', methods: ['GET', 'POST', 'PATCH', 'DELETE'] },
      { path: '/api/penalties', methods: ['GET', 'POST', 'PATCH', 'DELETE'] },
      { path: '/api/sales', methods: ['GET', 'POST', 'PATCH', 'DELETE'] },
      { path: '/api/feedbacks', methods: ['GET', 'POST', 'PATCH', 'DELETE'] },
      { path: '/api/stats', methods: ['GET'] },
      { path: '/api/public', methods: ['GET'] },
      { path: '/admin', methods: ['GET'] },
    ],
    [UserRole.MANAGER]: [
      { path: '/api/users', methods: ['GET'] },
      { path: '/api/users/me', methods: ['GET'] },
      { path: '/api/libraries', methods: ['GET', 'PATCH'] },
      { path: '/api/libraries/[library]', methods: ['GET', 'PATCH'] },
      { path: '/api/libraries/[library]/managers', methods: ['GET'] },
      { path: '/api/libraries/[library]/books', methods: ['GET'] },
      { path: '/api/books', methods: ['GET', 'POST', 'PATCH', 'DELETE'] },
      { path: '/api/books/[book]', methods: ['GET', 'PATCH', 'DELETE'] },
      { path: '/api/loans', methods: ['GET', 'POST', 'PATCH'] },
      { path: '/api/reservations', methods: ['GET', 'POST', 'PATCH'] },
      { path: '/api/penalties', methods: ['GET', 'POST', 'PATCH'] },
      { path: '/api/sales', methods: ['GET'] },
      { path: '/api/feedbacks', methods: ['GET', 'POST'] },
      { path: '/api/stats', methods: ['GET'] },
      { path: '/api/public', methods: ['GET'] },
    ],
    [UserRole.CLIENT]: [
      { path: '/api/users/me', methods: ['GET', 'PATCH'] },
      { path: '/api/books', methods: ['GET'] },
      { path: '/api/libraries', methods: ['GET'] },
      { path: '/api/libraries/[library]', methods: ['GET'] },
      { path: '/api/libraries/[library]/books', methods: ['GET'] },
      { path: '/api/reservations', methods: ['GET', 'POST', 'DELETE'] },
      { path: '/api/feedbacks', methods: ['GET', 'POST'] },
      { path: '/api/public', methods: ['GET'] },
    ],
    [UserRole.DELIVERY]: [
      { path: '/api/sales', methods: ['GET', 'PATCH'] },
      { path: '/api/users/me', methods: ['GET'] },
      { path: '/api/public', methods: ['GET'] },
    ],
  };

  return (
    permissions[role]?.some((rule) => {
      const pathMatches = path === rule.path;
      const methodMatches = !rule.methods || rule.methods.includes(method);
      return pathMatches && methodMatches;
    }) ?? false
  );
}

export const config = {
  matcher: ['/api/((?!auth/login|auth/register|auth/logout).*)', '/admin/:path*'],
};