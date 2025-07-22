import { UserRole } from "@/app/generated/prisma";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, context: { params: any }) {
  try {
    const headers = request.headers;
    const currentUserRole = headers.get("x-user-role") as UserRole;

     // 2. Vérification des permissions
     const isAdmin = currentUserRole === UserRole.ADMIN;
     if (!isAdmin ) {
       return Response.json({ error: 'Permission refusée' }, { status: 403 });
     }
    const { id } = context.params;
    if (isNaN(id)) {
      return Response.json(
        { error: "L'id de l'utilisateur est requis" },
        { status: 400 }
      );
    }

    const notifications = await prisma.notification.findMany({
      where: { userId: id },
    });

    if (!notifications) {
      return Response.json({
        error: "Pas de notifications pour ce manager",
      });
    }

    return Response.json({
        data : notifications,
        status : 200
    })
  } catch (error) {
    if (error instanceof Error) {
        return Response.json({
            message : "Erreur lors de la récupération des notifications d'actions",
            status : 500,
            error : error.message
        })
    }
    return Response.json({
        error : error,
        message : "Erreur de serveur",
        status : 500
    })
  }
}
