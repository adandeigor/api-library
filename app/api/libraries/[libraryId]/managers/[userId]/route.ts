import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { UserRole } from "@/app/generated/prisma";
import { ActionType, logAction } from '@/lib/logger';


async function IsManager(userId: number, libraryId: number): Promise<boolean> {
  try {
    if (!Number.isInteger(userId) || !Number.isInteger(libraryId) || userId <= 0 || libraryId <= 0) {
      return false;
    }
    const library = await prisma.library.findUnique({
      where: { id: libraryId, managerId: userId },
    });
    return !!library;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest, context: { params: any }) {
  try {
    // 1. Authentification via headers
    const headers = request.headers;
    const currentUserId = headers.get('x-user-id');
    const currentUserRole = headers.get('x-user-role') as UserRole;
    const currentUserLibraryId = headers.get('x-user-library-id');

    if (!currentUserId || !Object.values(UserRole).includes(currentUserRole)) {
      return NextResponse.json(
        { error: 'Authentification requise ou rôle invalide' },
        { status: 401 }
      );
    }

    // 2. Validation des IDs
    const {libraryId, userId} = context.params
    if (isNaN(libraryId) || isNaN(userId) || libraryId <= 0 || userId <= 0) {
      return NextResponse.json({ error: 'ID invalide' }, { status: 400 });
    }

    // 3. Vérification des permissions
    const isAdmin = currentUserRole === UserRole.ADMIN;
    const isManagerOfLibrary =
      currentUserRole === UserRole.MANAGER && parseInt(currentUserLibraryId as string) === libraryId;

    if (!isAdmin && !isManagerOfLibrary) {
      return NextResponse.json({ error: 'Permissions insuffisantes' }, { status: 403 });
    }

    // 4. Vérification de l'existence de la bibliothèque
    const library = await prisma.library.findUnique({
      where: { id: libraryId },
    });
    if (!library) {
      return NextResponse.json({ error: 'Bibliothèque non trouvée' }, { status: 404 });
    }

    // 5. Récupération du manager
    const manager = await prisma.user.findFirst({
      where: {
        id: userId,
        role: UserRole.MANAGER,
        library: { id: libraryId },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        lastConnected: true,
        createdAt: true,
      },
    });

    if (!manager) {
      return NextResponse.json(
        { error: 'Manager non trouvé dans cette bibliothèque' },
        { status: 404 }
      );
    }

    // 6. Journalisation
    await logAction(ActionType.MANAGER_REMOVED, parseInt(currentUserId), {
      managerId: userId,
      libraryId,
      action: 'retrieve',
    });

    return NextResponse.json(manager);
  } catch (error) {
    console.error('[GET_MANAGER_ERROR]', error);
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest,context: { params: any } ) {
  try {
    // 1. Authentification ADMIN uniquement
    const headers = request.headers;
    const currentUserId = headers.get('x-user-id');
    const currentUserRole = headers.get('x-user-role') as UserRole;

    if (!currentUserId || currentUserRole !== UserRole.ADMIN) {
      return NextResponse.json({ error: 'Action réservée aux administrateurs' }, { status: 403 });
    }

    // 2. Validation des IDs
    const {libraryId, userId} = context.params
    if (isNaN(libraryId) || isNaN(userId) || libraryId <= 0 || userId <= 0) {
      return NextResponse.json({ error: 'ID invalide' }, { status: 400 });
    }

    // 3. Vérification de l'existence de la bibliothèque
    const library = await prisma.library.findUnique({
      where: { id: libraryId },
    });
    if (!library) {
      return NextResponse.json({ error: 'Bibliothèque non trouvée' }, { status: 404 });
    }

    // 4. Vérification que l'utilisateur est bien manager
    const isManager = await IsManager(userId, libraryId);
    if (!isManager) {
      return NextResponse.json(
        { error: 'Manager non trouvé dans cette bibliothèque' },
        { status: 404 }
      );
    }

    // 5. Dissociation du manager
    await prisma.library.update({
      where: { id: libraryId },
      data: { manager: { disconnect: true } },
    });

    // 6. Journalisation
    await logAction(ActionType.MANAGER_REMOVED, parseInt(currentUserId), {
      managerId: userId,
      libraryId,
      action: 'dissociation',
    });

    return NextResponse.json({ success: true, message: 'Manager dissocié de la bibliothèque' });
  } catch (error) {
    console.error('[REMOVE_MANAGER_ERROR]', error);
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 });
  }
}