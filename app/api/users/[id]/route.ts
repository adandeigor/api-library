import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { UserRole } from "@/app/generated/prisma";
import { userUpdateSchema } from "@/lib/validator";
import bcrypt from 'bcrypt';
import { ActionType, logAction } from '@/lib/logger';


export async function PATCH(request: NextRequest, context : {params:any}) {
  try {
    // 1. Récupérer les headers injectés par le middleware
    const headers = request.headers; // Pas besoin de `new Headers`
    const currentUserId = headers.get('x-user-id');
    const currentUserRole = headers.get('x-user-role') as UserRole;

    if (!currentUserId || !Object.values(UserRole).includes(currentUserRole)) {
      return NextResponse.json(
        { error: 'Headers utilisateur manquants ou rôle invalide' },
        { status: 401 }
      );
    }

    const params = context.params
    // 2. Vérification des permissions
    const isAdmin = currentUserRole === UserRole.ADMIN;
    const isSelfUpdate = params.id === 'me' || params.id === currentUserId;

    if (!isSelfUpdate && !isAdmin) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    // 3. Validation des données
    const body = await request.json();
    const validation = userUpdateSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    // 4. Vérification de l'existence de l'utilisateur
    const userId = params.id === 'me' ? parseInt(currentUserId) : parseInt(params.id);
    if (isNaN(userId) || userId <= 0) {
      return NextResponse.json({ error: 'ID utilisateur invalide' }, { status: 400 });
    }

    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true },
    });

    if (!existingUser) {
      return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });
    }

    // 5. Vérification de l'unicité de l'email si modifié
    const { data } = validation;
    if (data.email && data.email !== existingUser.email) {
      const emailExists = await prisma.user.findUnique({
        where: { email: data.email },
        select: { id: true },
      });

      if (emailExists) {
        return NextResponse.json({ error: 'Cet email est déjà utilisé' }, { status: 409 });
      }
    }

    // 6. Préparation des données de mise à jour
    const updateData: any = {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
    };

    // 7. Gestion du mot de passe
    if (data.password) {
      updateData.password = await bcrypt.hash(data.password, 10);
      await logAction(ActionType.USER_PASSWORD_CHANGE, parseInt(currentUserId), {
        targetUserId: userId,
      });
    }

    // 8. Gestion des champs réservés aux admins
    if (isAdmin && data.role) {
      updateData.role = data.role;

      // Si le rôle devient MANAGER, vérifier l'association à une bibliothèque
      if (data.role === UserRole.MANAGER && data.libraryId) {
        const library = await prisma.library.findUnique({
          where: { id: data.libraryId },
          select: { id: true, managerId: true },
        });

        if (!library) {
          return NextResponse.json({ error: 'Bibliothèque non trouvée' }, { status: 404 });
        }

        // Vérifier si la bibliothèque a déjà un manager
        if (library.managerId && library.managerId !== userId) {
          return NextResponse.json(
            { error: 'Cette bibliothèque a déjà un manager' },
            { status: 409 }
          );
        }

        // Vérifier si l'utilisateur est déjà manager d'une autre bibliothèque
        const existingLibrary = await prisma.library.findFirst({
          where: { managerId: userId },
          select: { id: true },
        });

        if (existingLibrary && existingLibrary.id !== data.libraryId) {
          return NextResponse.json(
            { error: 'Cet utilisateur est déjà manager d\'une autre bibliothèque' },
            { status: 409 }
          );
        }
      }

      // Log des modifications sensibles
      if (data.role) {
        await logAction(ActionType.USER_ROLE_CHANGE, parseInt(currentUserId), {
          targetUserId: userId,
          oldRole: existingUser.role,
          newRole: data.role,
        });
      }
    }

    // 9. Exécution de la mise à jour de l'utilisateur
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        phone: true,
      },
    });

    // 10. Mise à jour de la relation avec la bibliothèque si nécessaire
    if (isAdmin && data.libraryId && data.role === UserRole.MANAGER) {
      await prisma.library.update({
        where: { id: data.libraryId },
        data: { manager: { connect: { id: userId } } },
      });
    }

    // 11. Log de la modification
    await logAction(ActionType.USER_UPDATE, parseInt(currentUserId), {
      targetUserId: userId,
      updatedFields: Object.keys(data),
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error('[USER_UPDATE_ERROR]', error);
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context : {params:any}) {
  try {
    // 1. Récupérer les headers injectés par le middleware
    const headers = request.headers;
    const currentUserId = headers.get('x-user-id');
    const currentUserRole = headers.get('x-user-role') as UserRole;

    if (!currentUserId || !Object.values(UserRole).includes(currentUserRole)) {
      return NextResponse.json(
        { error: 'Headers utilisateur manquants ou rôle invalide' },
        { status: 401 }
      );
    }

    // 2. Vérification des permissions (seul un ADMIN peut supprimer)
    if (currentUserRole !== UserRole.ADMIN) {
      return NextResponse.json(
        { error: 'Permission refusée - Seul un ADMIN peut supprimer un utilisateur' },
        { status: 403 }
      );
    }

    const params = context.params
    // 3. Empêcher l'auto-suppression
    const userIdToDelete = params.id === 'me' ? parseInt(currentUserId) : parseInt(params.id);
    if (isNaN(userIdToDelete) || userIdToDelete <= 0) {
      return NextResponse.json({ error: 'ID utilisateur invalide' }, { status: 400 });
    }

    if (userIdToDelete === parseInt(currentUserId)) {
      return NextResponse.json({ error: 'Auto-suppression non autorisée' }, { status: 403 });
    }

    // 4. Vérifier l'existence de l'utilisateur et ses dépendances
    const userToDelete = await prisma.user.findUnique({
      where: { id: userIdToDelete },
      select: {
        id: true,
        email: true,
        role: true,
        loans: { where: { returnedAt: null }, select: { id: true } },
        reservations: { where: { status: 'PENDING' }, select: { id: true } },
        sales: { where: { status: 'PENDING' }, select: { id: true } },
      },
    });

    if (!userToDelete) {
      return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });
    }

    // 5. Vérifier les dépendances
    const hasActiveDependencies =
      userToDelete.loans.length > 0 ||
      userToDelete.reservations.length > 0 ||
      userToDelete.sales.length > 0;

    if (hasActiveDependencies) {
      return NextResponse.json(
        {
          error: 'Impossible de supprimer cet utilisateur',
          details: {
            hasActiveLoans: userToDelete.loans.length > 0,
            hasPendingReservations: userToDelete.reservations.length > 0,
            hasPendingSales: userToDelete.sales.length > 0,
          },
        },
        { status: 400 }
      );
    }

    // 6. Vérifier si l'utilisateur est manager d'une bibliothèque
    const library = await prisma.library.findFirst({
      where: { managerId: userIdToDelete },
      select: { id: true },
    });

    // 7. Sauvegarder les données pour le log
    const userSnapshot = {
      id: userToDelete.id,
      email: userToDelete.email,
      role: userToDelete.role,
      managedLibraryId: library?.id || null,
    };

    // 8. Dissocier l'utilisateur de la bibliothèque si nécessaire
    if (library) {
      await prisma.library.update({
        where: { id: library.id },
        data: { manager: { disconnect: true } },
      });
    }

    // 9. Exécuter la suppression
    await prisma.user.delete({
      where: { id: userIdToDelete },
    });

    // 10. Logger l'action
    await logAction(ActionType.USER_DELETE, parseInt(currentUserId), {
      deletedUser: userSnapshot,
      deletedAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, message: 'Utilisateur supprimé avec succès' });
  } catch (error) {
    console.error('[USER_DELETE_ERROR]', error);
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 });
  }
}