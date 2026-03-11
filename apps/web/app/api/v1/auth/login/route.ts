import { json } from "@/src/lib/http";
import { verifyPassword, createSession, buildSessionCookie, shouldUseSecureCookies } from "@/src/lib/auth";
import { getRuntimeBindings } from "@/src/lib/runtime";
import { consumeRateLimit, getClientIp } from "@/src/lib/rate-limit";

export async function POST(request: Request): Promise<Response> {
    const bindings = getRuntimeBindings();
    if (!bindings.ROUTER_DB) {
        return json({ error: "Server misconfigured." }, 500);
    }
    const ip = getClientIp(request);

    const ipLimit = await consumeRateLimit({
        db: bindings.ROUTER_DB,
        bucket: "auth:login:ip",
        identifier: ip,
        maxRequests: 30,
        windowSeconds: 15 * 60
    });
    if (!ipLimit.allowed) {
        return json(
            { error: "Too many login attempts. Try again later." },
            429,
            { "retry-after": String(ipLimit.retryAfterSeconds) }
        );
    }

    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return json({ error: "Invalid JSON body." }, 400);
    }

    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !password) {
        return json({ error: "Email and password are required." }, 400);
    }

    const emailIpLimit = await consumeRateLimit({
        db: bindings.ROUTER_DB,
        bucket: "auth:login:email_ip",
        identifier: `${email.toLowerCase()}|${ip}`,
        maxRequests: 10,
        windowSeconds: 15 * 60
    });
    if (!emailIpLimit.allowed) {
        return json(
            { error: "Too many login attempts. Try again later." },
            429,
            { "retry-after": String(emailIpLimit.retryAfterSeconds) }
        );
    }

    const user = await bindings.ROUTER_DB
        .prepare("SELECT id, name, password_hash FROM users WHERE email = ?1 LIMIT 1")
        .bind(email)
        .first<{ id: string; name: string; password_hash: string | null }>();

    if (!user || !user.password_hash) {
        return json({ error: "Invalid email or password." }, 401);
    }

    const [salt, hash] = user.password_hash.split(":");
    if (!salt || !hash) {
        return json({ error: "Invalid email or password." }, 401);
    }

    const isValid = await verifyPassword(password, hash, salt);
    if (!isValid) {
        return json({ error: "Invalid email or password." }, 401);
    }

    const sessionToken = await createSession(user.id, bindings.ROUTER_DB);
    const secureCookie = shouldUseSecureCookies(bindings.SESSION_COOKIE_SECURE);
    const sessionCookie = buildSessionCookie(sessionToken, { secure: secureCookie });

    return json({
        user: { id: user.id, name: user.name, email }
    }, 200, {
        "set-cookie": sessionCookie
    });
}
