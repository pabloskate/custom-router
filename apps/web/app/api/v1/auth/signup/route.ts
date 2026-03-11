import { json } from "@/src/lib/http";
import { hashPassword, createSession, buildSessionCookie, shouldUseSecureCookies } from "@/src/lib/auth";
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
        bucket: "auth:signup:ip",
        identifier: ip,
        maxRequests: 12,
        windowSeconds: 15 * 60
    });
    if (!ipLimit.allowed) {
        return json(
            { error: "Too many signup attempts. Try again later." },
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

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!name || !email || !password) {
        return json({ error: "Name, email, and password are required." }, 400);
    }

    const emailLimit = await consumeRateLimit({
        db: bindings.ROUTER_DB,
        bucket: "auth:signup:email",
        identifier: email.toLowerCase(),
        maxRequests: 8,
        windowSeconds: 60 * 60
    });
    if (!emailLimit.allowed) {
        return json(
            { error: "Too many signup attempts. Try again later." },
            429,
            { "retry-after": String(emailLimit.retryAfterSeconds) }
        );
    }

    if (password.length < 8) {
        return json({ error: "Password must be at least 8 characters long." }, 400);
    }

    // Check if user already exists
    const existingUser = await bindings.ROUTER_DB
        .prepare("SELECT id FROM users WHERE email = ?1 LIMIT 1")
        .bind(email)
        .first();

    if (existingUser) {
        return json({ error: "A user with this email already exists." }, 400);
    }

    const userId = crypto.randomUUID();
    const now = new Date().toISOString();

    const { hash, salt } = await hashPassword(password);
    // We store the hash and salt together as "salt:hash"
    const storedPassword = `${salt}:${hash}`;

    await bindings.ROUTER_DB
        .prepare("INSERT INTO users (id, name, email, password_hash, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
        .bind(userId, name, email, storedPassword, now, now)
        .run();

    const sessionToken = await createSession(userId, bindings.ROUTER_DB);
    const secureCookie = shouldUseSecureCookies(bindings.SESSION_COOKIE_SECURE);
    const sessionCookie = buildSessionCookie(sessionToken, { secure: secureCookie });

    return json({
        user: { id: userId, name, email }
    }, 201, {
        "set-cookie": sessionCookie
    });
}
