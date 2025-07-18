import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { UserRole } from '@/app/generated/prisma';

export async function GET(request: NextRequest) {
  try {
    const userRole = request.headers.get('x-user-role') as UserRole;
    const userLibraryId = request.headers.get('x-user-library-id');

    if (userRole !== 'ADMIN' && userRole !== 'MANAGER') {
      return NextResponse.json({ error: 'Accès interdit' }, { status: 403 });
    }

    // Filtre pour les managers : stats de leur bibliothèque uniquement
    const libraryFilter = userRole === 'MANAGER' && userLibraryId ? { libraryId: Number(userLibraryId) } : {};

    // Statistiques globales
    const [
      totalBooks,
      totalUsers,
      totalLoans,
      totalReservations,
      totalSales,
      totalPenalties,
      totalFeedbacks,
      booksByCategoryRaw,
      loansByMonthRaw,
      reservationsByMonthRaw
    ] = await Promise.all([
      prisma.book.count({ where: libraryFilter }),
      prisma.user.count({ where: userRole === 'MANAGER' && userLibraryId ? { library: { id: Number(userLibraryId) } } : {} }),
      prisma.loan.count({ where: userRole === 'MANAGER' && userLibraryId ? { book: { libraryId: Number(userLibraryId) } } : {} }),
      prisma.reservation.count({ where: userRole === 'MANAGER' && userLibraryId ? { book: { libraryId: Number(userLibraryId) } } : {} }),
      prisma.sale.count({ where: userRole === 'MANAGER' && userLibraryId ? { book: { libraryId: Number(userLibraryId) } } : {} }),
      prisma.penalty.count({ where: userRole === 'MANAGER' && userLibraryId ? { loan: { book: { libraryId: Number(userLibraryId) } } } : {} }),
      prisma.feedback.count({ where: userRole === 'MANAGER' && userLibraryId ? { book: { libraryId: Number(userLibraryId) } } : {} }),
      prisma.book.groupBy({
        by: ['categoryId'],
        _count: { _all: true },
        where: libraryFilter
      }),
      prisma.loan.groupBy({
        by: ['loanedAt'],
        _count: { _all: true },
        where: userRole === 'MANAGER' && userLibraryId ? { book: { libraryId: Number(userLibraryId) } } : {}
      }),
      prisma.reservation.groupBy({
        by: ['reservedAt'],
        _count: { _all: true },
        where: userRole === 'MANAGER' && userLibraryId ? { book: { libraryId: Number(userLibraryId) } } : {}
      })
    ]);
    // Regroupement livres par catégorie
    const categories = await prisma.category.findMany();
    const booksByCategory = booksByCategoryRaw.map(bc => {
      const cat = categories.find(c => c.id === bc.categoryId);
      return {
        category: cat ? cat.name : 'Autres',
        count: bc._count._all
      };
    });

    // Tendance prêts/réservations par mois (6 derniers mois)
    function groupByMonth(raw: any[], dateKey: string) {
      const map = new Map<string, number>();
      raw.forEach((item: any) => {
        const date = new Date(item[dateKey]);
        const month = date.toLocaleString('default', { month: 'short' });
        map.set(month, (map.get(month) || 0) + item._count._all);
      });
      return map;
    }
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const loansTrendMap = groupByMonth(loansByMonthRaw, 'loanedAt');
    const reservationsTrendMap = groupByMonth(reservationsByMonthRaw, 'reservedAt');
    const loansTrend = months.map(month => ({
      month,
      loans: loansTrendMap.get(month) || 0,
      reservations: reservationsTrendMap.get(month) || 0
    })).slice(0, 6); // 6 derniers mois

    const stats = {
      totalBooks,
      totalUsers,
      totalLoans,
      totalReservations,
      totalSales,
      totalPenalties,
      totalFeedbacks,
      loansTrend,
      booksByCategory
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error('[GET_STATS_ERROR]', error);
    return NextResponse.json({ error: 'Erreur lors de la récupération des statistiques' }, { status: 500 });
  }
} 