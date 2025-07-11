import { initTRPC, TRPCError } from "@trpc/server";
import { CreateHTTPContextOptions } from "@trpc/server/adapters/standalone";

/** Per-request context (add more fields whenever you need them) */
export const createContext = ({ req, res }: CreateHTTPContextOptions) => ({
  req,
  res,
});
export type Context = Awaited<ReturnType<typeof createContext>>;

/** tRPC factory bound to our context */
export const t = initTRPC.context<typeof createContext>().create();

/** Minimal error logger */
export function onTrpcError({ error }: { error: TRPCError }) {
   
  console.error("[tRPC]", error.code, error.message);
}
