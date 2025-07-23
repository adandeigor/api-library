import { UserRole } from "@/app/generated/prisma";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
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

    const library = prisma.library.findUnique({
        where : {managerId : parseInt(currentUserId as string)}
    })

    Response.json({
        library : library,
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
