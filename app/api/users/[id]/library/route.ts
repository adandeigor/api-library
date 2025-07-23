import { UserRole } from "@/app/generated/prisma";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, context: { params: any }) {
  try {
    const headers = request.headers;
    const currentUserRole = headers.get("x-user-role") as UserRole;
    const currentUserId = headers.get("x-user-id") 

    // 2. Vérification des permissions
    const isAdmin =
      currentUserRole === UserRole.ADMIN ||
      currentUserRole === UserRole.MANAGER;
    if (!isAdmin) {
      return Response.json({ error: "Permission refusée" }, { status: 403 });
    }
    const { id } = context.params;
    if (isNaN(id)) {
      return Response.json(
        { error: "L'id de l'utilisateur est requis" },
        { status: 400 }
      );
    }

    const library = prisma.library.findUnique({
        where : {managerId : parseInt(currentUserId as string)}
    })

    Response.json({
        data : library,
        message : "Librairie récupérée avec succès",
        status :  200
    })
  } catch (error) {
    if (error instanceof Error) {
        return Response.json({
            error : error.message,
            status : 500
        })
    }
    return Response.json({
        error : error,
        status : 500
    })
  }
}
