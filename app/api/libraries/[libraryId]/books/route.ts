import { prisma } from "@/lib/prisma";

export async function GET(request: Request, context: { params: any }) {
  const { libraryId } = context.params;
  try {
    const library_Id = parseInt(libraryId);
  if (isNaN(library_Id)) {
    return Response.json({ statut: 400, error: "L'id du livre est invalide" });
  }
  const books = await  prisma.book.findMany({
    where: {libraryId : library_Id},
    include: {
        category: true,
        library: true,
        reservations: true,
        loans: true,
        sales: true,
        feedbacks: true,
        stock: true,
      },
  })
  if (!books) {
    return Response.json({
        statut : 400,
        error : "Aucun livre n'est trouvé dans cette librairie"
    })
  }
  return Response.json({
    message : "Livres trouvés",
    statut : 200,
    data : books
  })
  } catch (error) {
    if (error instanceof Error) {
        return Response.json({
            error : "Erreur lors de la récupération des livres",
            statut : 500,
            details : error.message
        })
    }
    return Response.json({
        error : "Erreur lors de la récupération des livres",
        statut : 500,
        details : error
    })
  }
}
