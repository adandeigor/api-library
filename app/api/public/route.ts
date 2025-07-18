import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    // Récupérer toutes les bibliothèques validées
    const libraries = await prisma.library.findMany({
      where: { status: 'VALIDATED' },
      select: {
        id: true,
        name: true,
        address: true,
        contact: true,
        ifu: true,
        rccm: true,
        books: {
          select: {
            id: true,
            title: true,
            coverUrl: true,
            status: true,
            author: true,
            category: { select: { name: true, color: true } }
          }
        },
        _count: { select: { books: true } }
      }
    });

    // Mise en forme pour le front
    const data = libraries.map(lib => ({
      id: lib.id,
      name: lib.name,
      address: lib.address,
      contact: lib.contact,
      ifu: lib.ifu,
      rccm: lib.rccm,
      booksCount: lib._count.books,
      books: lib.books.map(book => ({
        id: book.id,
        title: book.title,
        coverUrl: book.coverUrl,
        status: book.status,
        author: `${book.author}`,
        category: book.category.name,
        categoryColor: book.category.color
      }))
    }));

    return NextResponse.json({ libraries: data });
  } catch (error) {
    console.error('[GET_PUBLIC_ERROR]', error);
    return NextResponse.json({ error: 'Erreur lors de la récupération des données publiques' }, { status: 500 });
  }
} 