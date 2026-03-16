import { withAdminAuth } from "@/src/lib/auth";
import { json } from "@/src/lib/infra";

export async function GET(request: Request): Promise<Response> {
    return withAdminAuth(request, async (bindings) => {
        if (!bindings.ROUTER_KV) {
            return json({ error: "Missing ROUTER_KV binding" }, 500);
        }

        try {
            const metaRaw = await bindings.ROUTER_KV.get("router:active:meta", { type: "text" });
            return json({ meta: metaRaw }, 200);
        } catch (error) {
            return json({ error: String(error) }, 500);
        }
    });
}
