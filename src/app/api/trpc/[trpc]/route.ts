import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";

export const runtime = "nodejs";

function handler(req: Request): Promise<Response> {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createTRPCContext({ headers: req.headers }),
    onError: ({ error, path, type }) => {
      if (process.env.NODE_ENV !== "production") {
        console.error(
          `[tRPC] ${type} ${path ?? "<no-path>"} failed: ${error.message}`,
        );
      }
    },
  });
}

export { handler as GET, handler as POST };
