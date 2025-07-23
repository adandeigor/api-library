import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@/app/generated/prisma";
import { ActionType, logAction } from "@/lib/logger";
import { bookCreateSchema } from "@/lib/validator";

export async function GET(request: NextRequest) {
  try {
    // 1. Récupération des paramètres
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const limit = Math.min(Number(searchParams.get("limit")) || 20, 100);
    const page = Math.max(Number(searchParams.get("page")) || 1, 1);
    const skip = (page - 1) * limit;

    // 2. Validation des paramètres
    if (isNaN(limit) || isNaN(page)) {
      return NextResponse.json({ error: "Paramètres de pagination invalides" }, { status: 400 });
    }

    // 3. Récupération des headers d'authentification
    const userId = request.headers.get("x-user-id");
    const userRole = request.headers.get("x-user-role") as UserRole;
    const userLibraryId = request.headers.get("x-user-library-id");

    // 4. Construction du filtre
    const where: any = {
      OR: [
        { title: { contains: search, mode: "insensitive" } },
        { author: { contains: search, mode: "insensitive" } },
      ],
    };

    // Filtre par bibliothèque si MANAGER
    if (userRole === UserRole.MANAGER && userLibraryId) {
      where.libraryId = parseInt(userLibraryId);
    } else if (userRole !== UserRole.ADMIN) {
      // Les utilisateurs non-admin ne voient que les livres AVAILABLE ou RESERVED
      where.status = { in: ["AVAILABLE", "RESERVED"] };
    }

    // 5. Requête paginée
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


    // 7. Formatage de la réponse
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
    console.error("[GET_BOOKS_ERROR]", error);
    return NextResponse.json({ error: "Erreur lors de la récupération des livres" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // 1. Vérification des permissions
    const userId = request.headers.get("x-user-id");
    const userRole = request.headers.get("x-user-role") as UserRole;
    const userLibraryId = request.headers.get("x-user-library-id");

    if (!userId || !(userRole === UserRole.ADMIN || userRole === UserRole.MANAGER)) {
      return NextResponse.json(
        { error: "Action réservée aux administrateurs et gestionnaires" },
        { status: 403 }
      );
    }

    // 2. Vérification de la bibliothèque
    const library = await prisma.library.findFirst({
      where: {
        managerId: parseInt(userId),
      },
    });

    if (!library) {
      return NextResponse.json(
        { error: "Veuillez créer une librairie avant d’y ajouter des livres" },
        { status: 403 }
      );
    }

    // 3. Validation des données
    const body = await request.json();
    const validation = bookCreateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // 4. Vérification de l’existence des relations
    const categoryExists = await prisma.category.findUnique({
      where: { id: validation.data.categoryId },
    });

    if (!categoryExists) {
      return NextResponse.json(
        {
          error: "Catégorie introuvable",
          details: { categoryId: validation.data.categoryId },
        },
        { status: 404 }
      );
    }

    // 5. Création du livre avec stock initial
    const newBook = await prisma.book.create({
      data: {
        title: validation.data.title,
        author: validation.data.author,
        summary: validation.data.summary,
        isbn: validation.data.isbn,
        language: validation.data.language,
        genre: validation.data.genre,
        pages: validation.data.pages,
        edition: validation.data.edition,
        coverUrl: validation.data.coverUrl,
        status: validation.data.status || "AVAILABLE",
        price: validation.data.price,
        isSellable: validation.data.isSellable || false,
        categoryId: validation.data.categoryId,
        libraryId: library.id,
        stock: {
          create: { quantity: validation.data.stockQuantity ?? 0 }, // Toujours créer un stock, 0 par défaut
        },
      },
      include: {
        category: { select: { id: true, name: true, color: true } },
        library: { select: { id: true, name: true } },
        stock: { select: { quantity: true } },
      },
    });

    // 6. Journalisation
    await logAction(ActionType.BOOK_CREATED, parseInt(userId), {
      bookId: newBook.id,
      title: newBook.title,
      libraryId: newBook.libraryId,
      stockQuantity: newBook.stock?.quantity ?? 0,
    });

    // 7. Formatage de la réponse
    return NextResponse.json(
      {
        success: true,
        message: "Livre créé avec succès",
        book: {
          ...newBook,
          category: newBook.category,
          library: newBook.library,
          stockQuantity: newBook.stock?.quantity ?? 0,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[CREATE_BOOK_ERROR]", error);
    return NextResponse.json({ error: "Erreur lors de la création du livre" }, { status: 500 });
  }
}