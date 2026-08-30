import "./load-env";
import { getDb, runAsSystem } from "../src/lib/db";
import { SignJWT } from "jose";

runAsSystem(async () => {
  const db = await getDb();
  const u = await db.get(`SELECT id, email, name, role FROM users LIMIT 1`);
  if (!u) { console.error("No user"); process.exit(1); }
  const secret = new TextEncoder().encode(process.env.AUTH_SECRET || "dev-insecure-secret-change-me");
  const token = await new SignJWT({ email: u.email, name: u.name, role: u.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(u.id)
    .setIssuer("rauell-os")
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(secret);
  console.log("rauell_session=" + token);
});
