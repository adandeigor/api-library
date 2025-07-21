import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, { book }: { book: string }) {
  try {
    const bookId = parseInt(book);
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

    return NextResponse.json(fullBook);
  } catch (error) {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}