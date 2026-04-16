import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { RegisterBody, LoginBody } from "@workspace/api-zod";
import { authMiddleware, signToken } from "../middlewares/auth";
import {
  ensureMongoConnection,
  nextSequence,
  UserModel,
  UserPreferenceModel,
  toDateISOString,
} from "../lib/mongo";

const router: IRouter = Router();

router.post("/auth/register", async (req, res): Promise<void> => {
  await ensureMongoConnection();
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { name, email, password, phone, role } = parsed.data;

  const existing = await UserModel.findOne({ email }).lean();
  if (existing) {
    res.status(400).json({ error: "البريد الإلكتروني مسجل بالفعل" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const userId = await nextSequence("users");
  const user = await UserModel.create({
    id: userId,
    name,
    email,
    passwordHash,
    phone: phone || null,
    role: role as "buyer" | "seller",
  });

  await UserPreferenceModel.create({
    id: await nextSequence("userPreferences"),
    userId: user.id,
  });

  const token = signToken({ userId: user.id, role: user.role });
  res.status(201).json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      createdAt: toDateISOString(user.createdAt),
    },
  });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  await ensureMongoConnection();
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;
  const user = await UserModel.findOne({ email }).lean();
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
      createdAt: toDateISOString(user.createdAt),
    },
  });
});

router.get("/auth/me", authMiddleware, async (req, res): Promise<void> => {
  await ensureMongoConnection();
  const user = await UserModel.findOne({ id: req.user!.userId }).lean();
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
    createdAt: toDateISOString(user.createdAt),
  });
});

export default router;
