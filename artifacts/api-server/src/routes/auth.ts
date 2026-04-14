import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable, userPreferencesTable } from "@workspace/db";
import { RegisterBody, LoginBody } from "@workspace/api-zod";
import { authMiddleware, signToken } from "../middlewares/auth";

const router: IRouter = Router();

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { name, email, password, phone, role } = parsed.data;

  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing.length > 0) {
    res.status(400).json({ error: "البريد الإلكتروني مسجل بالفعل" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db.insert(usersTable).values({
    name,
    email,
    passwordHash,
    phone: phone || null,
    role: role as "buyer" | "seller",
  }).returning();

  await db.insert(userPreferencesTable).values({ userId: user.id });

  const token = signToken({ userId: user.id, role: user.role });
  res.status(201).json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    },
  });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user) {
    res.status(401).json({ error: "بريد إلكتروني أو كلمة مرور غير صحيحة" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "بريد إلكتروني أو كلمة مرور غير صحيحة" });
    return;
  }

  const token = signToken({ userId: user.id, role: user.role });
  res.status(200).json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    },
  });
});

router.get("/auth/me", authMiddleware, async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId));
  if (!user) {
    res.status(404).json({ error: "المستخدم غير موجود" });
    return;
  }
  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  });
});

export default router;
