import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@/app/generated/prisma";
import { ActionType, logAction } from "@/lib/logger";

export async function GET(request: NextRequest, { params }: { params: { libraryId: string } }) {
  try {
    // 1. Validation du libraryId
    const libraryId = parseInt(params.libraryId);
    if (isNaN(libraryId)) {
      return NextResponse.json({ error: "ID de bibliothèque invalide" }, { status: 400 });
    }

    // 2. Récupération des paramètres de recherche et pagination
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const limit = Math.min(Number(searchParams.get("limit")) || 20, 100);
    const page = Math.max(Number(searchParams.get("page")) || 1, 1);
    const skip = (page - 1) * limit;

    // 3. Validation des paramètres
    if (isNaN(limit) || isNaN(page)) {
      return NextResponse.json({ error: "Paramètres de pagination invalides" }, { status: 400 });
    }

    // 4. Récupération des headers d'authentification
    const userId = request.headers.get("x-user-id");
    const userRole = request.headers.get("x-user-role") as UserRole;
    const userLibraryId = request.headers.get("x-user-library-id");

    // 5. Vérification des permissions
    if (userRole === UserRole.MANAGER && userLibraryId && parseInt(userLibraryId) !== libraryId) {
      return NextResponse.json(
        { error: "Vous n’êtes pas autorisé à accéder aux livres de cette bibliothèque" },
        { status: 403 }
      );
    }

    // 6. Vérification de l’existence de la bibliothèque
    const library = await prisma.library.findUnique({
      where: { id: libraryId },
    });

    if (!library) {
      return NextResponse.json({ error: "Bibliothèque non trouvée" }, { status: 404 });
    }

    // 7. Construction du filtre
    const where: any = {
      libraryId,
      OR: [
        { title: { contains: search, mode: "insensitive" } },
        { author: { contains: search, mode: "insensitive" } },
      ],
    };

    // Filtre par statut pour les non-admins
    if (userRole !== UserRole.ADMIN) {
      where.status = { in: ["AVAILABLE", "RESERVED"] };
    }

    // 8. Requête paginée
    const [books, totalCount] = await prisma.$transaction([
      prisma.book.findMany({
        where,
        select: {
          id: true,
          title: true,
          author: true,
          coverUrl: true,
          status: true,
          category: { select: { id: true, name: true, color: true } },
          library: { select: { id: true, name: true } },
          stock: { select: { quantity: true } },
        },
        orderBy: { title: "asc" },
        skip,
        take: limit,
      }),
      prisma.book.count({ where }),
    ]);



    // 10. Formatage de la réponse
    return NextResponse.json({
      data: books.map((book) => ({
        id: book.id,
        title: book.title,
        author: book.author,
        coverUrl: book.coverUrl,
        status: book.status,
        category: book.category,
        categoryColor: book.category.color,
        library: book.library,
        stockQuantity: book.stock?.quantity ?? 0,
      })),
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      },
    }, { status: 200 });
  } catch (error) {
    console.error("[GET_LIBRARY_BOOKS_ERROR]", error);
    return NextResponse.json({ error: "Erreur lors de la récupération des livres" }, { status: 500 });
  }
}