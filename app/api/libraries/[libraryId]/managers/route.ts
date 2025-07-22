import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { UserRole } from "@/app/generated/prisma";
import { ActionType, logAction } from '@/lib/logger';
import { assignManagerSchema } from "@/lib/validator";

export async function POST(request: NextRequest,  context: { params: any }) {
  try {
    // 1. Authentification et autorisation
    const headers = request.headers; // Pas besoin de `new Headers`
    const currentUserId = headers.get('x-user-id');
    const currentUserRole = headers.get('x-user-role') as UserRole;

    if (!currentUserId || currentUserRole !== UserRole.ADMIN) {
      return NextResponse.json(
        { error: 'Action réservée aux administrateurs' },
        { status: 403 }
      );
    }

    // 2. Validation des données
    const body = await request.json();
    const validation = assignManagerSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const {libraryId} = context.params
    const { userId } = validation.data;

    // Validation de libraryId
    if (isNaN(libraryId) || libraryId <= 0) {
      return NextResponse.json({ error: 'ID de bibliothèque invalide' }, { status: 400 });
    }

    // 3. Vérifications
    // - La bibliothèque existe
    const library = await prisma.library.findUnique({
      where: { id: libraryId },
      select: { id: true, managerId: true },
    });

    if (!library) {
      return NextResponse.json({ error: 'Bibliothèque non trouvée' }, { status: 404 });
    }

    // - L'utilisateur existe et est bien un MANAGER
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

    if (!user || user.role !== UserRole.MANAGER) {
      return NextResponse.json(
        { error: 'Utilisateur non trouvé ou n\'est pas un manager' },
        { status: 404 }
      );
    }

    // - L'utilisateur n'est pas déjà associé à une autre bibliothèque
    const existingLibrary = await prisma.library.findFirst({
      where: { managerId: userId },
      select: { id: true },
    });

    if (existingLibrary && existingLibrary.id !== libraryId) {
      return NextResponse.json(
        { error: 'Ce manager est déjà associé à une autre bibliothèque' },
        { status: 409 }
      );
    }

    // - Vérifier si la bibliothèque a déjà un manager
    if (library.managerId && library.managerId !== userId) {
      return NextResponse.json(
        { error: 'Cette bibliothèque a déjà un manager' },
        { status: 409 }
      );
    }

    // 4. Mise à jour de la bibliothèque
    const updatedLibrary = await prisma.library.update({
      where: { id: libraryId },
      data: { manager: { connect: { id: userId } } },
      select: {
        id: true,
        name: true,
        manager: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
    });

    // 5. Journalisation
    await logAction(ActionType.MANAGER_ASSIGNED, parseInt(currentUserId), {
      managerId: userId,
      libraryId,
      previousLibraryId: existingLibrary?.id || null,
    });

    return NextResponse.json({
      success: true,
      message: 'Manager associé avec succès',
      user: updatedLibrary.manager,
    });
  } catch (error) {
    console.error('[MANAGER_ASSIGN_ERROR]', error);
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 });
  }
}

export async function GET(request: NextRequest, context: { params: any }) {
  try {
    // 1. Vérification des permissions
    const headers = request.headers;
    const currentUserRole = headers.get('x-user-role') as UserRole;
    const currentUserLibraryId = headers.get('x-user-library-id');

    const {libraryId} = context.params

    // Validation de libraryId
    if (isNaN(libraryId) || libraryId <= 0) {
      return NextResponse.json({ error: 'ID de bibliothèque invalide' }, { status: 400 });
    }

    // 2. Vérification des permissions
    const isAdmin = currentUserRole === UserRole.ADMIN;
    const isManagerOfLibrary =
      currentUserRole === UserRole.MANAGER && parseInt(currentUserLibraryId || '0') === libraryId;

    if (!isAdmin && !isManagerOfLibrary) {
      return NextResponse.json({ error: 'Permission refusée' }, { status: 403 });
    }

    // 3. Récupération du manager
    const library = await prisma.library.findUnique({
      where: { id: libraryId },
      select: {
        manager: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            lastConnected: true,
          },
        },
      },
    });

    if (!library) {
      return NextResponse.json({ error: 'Bibliothèque non trouvée' }, { status: 404 });
    }

    // Retourner un tableau (vide ou avec un seul manager)
    const managers = library.manager ? [library.manager] : [];

    return NextResponse.json(managers);
  } catch (error) {
    console.error('[GET_MANAGERS_ERROR]', error);
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 });
  }
}