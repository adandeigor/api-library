import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { UserRole } from "@/app/generated/prisma";

// Schéma de validation pour la mise à jour d’un livre
const updateBookSchema = z.object({
  title: z.string().min(1, "Le titre est requis").optional(),
  summary: z.string().nullable().optional(),
  isbn: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
  genre: z.string().nullable().optional(),
  pages: z.number().int().positive().nullable().optional(),
  edition: z.string().nullable().optional(),
  coverUrl: z.string().url().nullable().optional(),
  status: z.enum(["AVAILABLE", "RESERVED", "LOANED", "SOLD"]).optional(),
  price: z.number().positive().nullable().optional(),
  isSellable: z.boolean().optional(),
  categoryId: z.number().int().positive().optional(),
  libraryId: z.number().int().positive().optional(),
  author: z.string().min(1, "L’auteur est requis").optional(),
  stockQuantity: z.number().int().nonnegative().optional(),
});


export async function GET(request: NextRequest, { params }: { params: { book: string } }) {
  try {
    const bookId = parseInt(params.book);
    if (isNaN(bookId)) {
      return NextResponse.json({ error: "ID de livre invalide" }, { status: 400 });
    }

    const fullBook = await prisma.book.findUnique({
      where: { id: bookId },
      include: {
        category: true,
        library: true,
        reservations: true,
        loans: true,
        sales: true,
        feedbacks: true,
        stock: true,
      },
    });

    if (!fullBook) {
      return NextResponse.json({ error: "Livre non trouvé" }, { status: 404 });
    }

    return NextResponse.json(fullBook, { status: 200 });
  } catch (error) {
    console.error("[GET_BOOK_ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { book: string } }) {
  try {
    const userId = request.headers.get("x-user-id");
    const userRole = request.headers.get("x-user-role") as UserRole;

    if (!userId || userRole !== UserRole.MANAGER) {
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
    }

    const bookId = parseInt(params.book);
    if (isNaN(bookId)) {
      return NextResponse.json({ error: "ID de livre invalide" }, { status: 400 });
    }

    const body = await request.json();
    const validatedData = updateBookSchema.parse(body);

    // Vérifier que le livre existe et appartient à la bibliothèque du manager
    const book = await prisma.book.findUnique({
      where: { id: bookId },
      include: { library: true },
    });

    if (!book) {
      return NextResponse.json({ error: "Livre non trouvé" }, { status: 404 });
    }

    const managerLibrary = await prisma.library.findFirst({
      where: { managerId: parseInt(userId) },
    });

    if (!managerLibrary || book.libraryId !== managerLibrary.id) {
      return NextResponse.json({ error: "Vous n’êtes pas autorisé à modifier ce livre" }, { status: 403 });
    }

    // Mettre à jour le livre et, si nécessaire, la quantité en stock
    const updatedBook = await prisma.book.update({
      where: { id: bookId },
      data: {
        title: validatedData.title,
        summary: validatedData.summary,
        isbn: validatedData.isbn,
        language: validatedData.language,
        genre: validatedData.genre,
        pages: validatedData.pages,
        edition: validatedData.edition,
        coverUrl: validatedData.coverUrl,
        status: validatedData.status,
        price: validatedData.price,
        isSellable: validatedData.isSellable,
        categoryId: validatedData.categoryId,
        libraryId: validatedData.libraryId,
        author: validatedData.author,
        stock: validatedData.stockQuantity
          ? {
              upsert: {
                create: { quantity: validatedData.stockQuantity },
                update: { quantity: validatedData.stockQuantity },
              },
            }
          : undefined,
      },
      include: {
        category: true,
        library: true,
        reservations: true,
        loans: true,
        sales: true,
        feedbacks: true,
        stock: true,
      },
    });

    return NextResponse.json(updatedBook, { status: 200 });
  } catch (error: any) {
    console.error("[PATCH_BOOK_ERROR]", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues.map(issue => issue.message).join(", ") }, { status: 400 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { book: string } }) {
  try {
    const userId = request.headers.get("x-user-id");
    const userRole = request.headers.get("x-user-role") as UserRole;

    if (!userId || userRole !== UserRole.MANAGER) {
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
    }

    const bookId = parseInt(params.book);
    if (isNaN(bookId)) {
      return NextResponse.json({ error: "ID de livre invalide" }, { status: 400 });
    }

    // Vérifier que le livre existe et appartient à la bibliothèque du manager
    const book = await prisma.book.findUnique({
      where: { id: bookId },
      include: { library: true, reservations: true, loans: true, sales: true },
    });

    if (!book) {
      return NextResponse.json({ error: "Livre non trouvé" }, { status: 404 });
    }

    const managerLibrary = await prisma.library.findFirst({
      where: { managerId: parseInt(userId) },
    });

    if (!managerLibrary || book.libraryId !== managerLibrary.id) {
      return NextResponse.json({ error: "Vous n’êtes pas autorisé à supprimer ce livre" }, { status: 403 });
    }

    // Vérifier s’il y a des réservations, prêts ou ventes actifs
    if (book.reservations.length > 0 || book.loans.length > 0 || book.sales.length > 0) {
      return NextResponse.json(
        { error: "Impossible de supprimer le livre : il est associé à des réservations, prêts ou ventes" },
        { status: 400 }
      );
    }

    // Supprimer le stock associé (s’il existe) avant le livre
    await prisma.bookStock.deleteMany({
      where: { bookId },
    });

    // Supprimer le livre
    await prisma.book.delete({
      where: { id: bookId },
    });

    return NextResponse.json({ message: "Livre supprimé avec succès" }, { status: 200 });
  } catch (error: any) {
    console.error("[DELETE_BOOK_ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}