import { Router, type IRouter } from "express";
import { eq, sql, desc } from "drizzle-orm";
import { db, usersTable, propertiesTable, interactionsTable, feedbackTable } from "@workspace/db";
import { CreateFeedbackBody, AdminApprovePropertyParams, AdminRejectPropertyParams, AdminResolveFeedbackParams } from "@workspace/api-zod";
import { authMiddleware, adminMiddleware } from "../middlewares/auth";

const router: IRouter = Router();

function formatProperty(p: typeof propertiesTable.$inferSelect) {
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    price: p.price,
    location: p.location,
    area: p.area,
    rooms: p.rooms,
    propertyType: p.propertyType,
    features: p.features,
    imageUrl: p.imageUrl,
    sellerId: p.sellerId,
    status: p.status,
    views: p.views,
    saves: p.saves,
    contacts: p.contacts,
    createdAt: p.createdAt.toISOString(),
  };
}

router.get("/admin/users", authMiddleware, adminMiddleware, async (_req, res): Promise<void> => {
  const users = await db.select().from(usersTable).orderBy(desc(usersTable.createdAt));
  res.json(users.map(u => ({
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    createdAt: u.createdAt.toISOString(),
  })));
});

router.get("/admin/properties", authMiddleware, adminMiddleware, async (_req, res): Promise<void> => {
  const properties = await db.select().from(propertiesTable).orderBy(desc(propertiesTable.createdAt));
  res.json(properties.map(formatProperty));
});

router.patch("/admin/properties/:id/approve", authMiddleware, adminMiddleware, async (req, res): Promise<void> => {
  const params = AdminApprovePropertyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [property] = await db.update(propertiesTable)
    .set({ status: "approved" })
    .where(eq(propertiesTable.id, params.data.id))
    .returning();

  if (!property) {
    res.status(404).json({ error: "العقار غير موجود" });
    return;
  }

  res.json(formatProperty(property));
});

router.patch("/admin/properties/:id/reject", authMiddleware, adminMiddleware, async (req, res): Promise<void> => {
  const params = AdminRejectPropertyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [property] = await db.update(propertiesTable)
    .set({ status: "rejected" })
    .where(eq(propertiesTable.id, params.data.id))
    .returning();

  if (!property) {
    res.status(404).json({ error: "العقار غير موجود" });
    return;
  }

  res.json(formatProperty(property));
});

router.get("/admin/feedbacks", authMiddleware, adminMiddleware, async (_req, res): Promise<void> => {
  const feedbacks = await db.select().from(feedbackTable).orderBy(desc(feedbackTable.createdAt));
  res.json(feedbacks.map(f => ({
    id: f.id,
    userId: f.userId,
    message: f.message,
    criteria: f.criteria,
    resolved: f.resolved,
    createdAt: f.createdAt.toISOString(),
  })));
});

router.post("/admin/feedback", authMiddleware, async (req, res): Promise<void> => {
  const parsed = CreateFeedbackBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [feedback] = await db.insert(feedbackTable).values({
    userId: req.user!.userId,
    message: parsed.data.message,
    criteria: parsed.data.criteria || null,
  }).returning();

  res.status(201).json({
    id: feedback.id,
    userId: feedback.userId,
    message: feedback.message,
    criteria: feedback.criteria,
    resolved: feedback.resolved,
    createdAt: feedback.createdAt.toISOString(),
  });
});

router.patch("/admin/feedbacks/:id/resolve", authMiddleware, adminMiddleware, async (req, res): Promise<void> => {
  const params = AdminResolveFeedbackParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [feedback] = await db.update(feedbackTable)
    .set({ resolved: true })
    .where(eq(feedbackTable.id, params.data.id))
    .returning();

  if (!feedback) {
    res.status(404).json({ error: "الملاحظة غير موجودة" });
    return;
  }

  res.json({
    id: feedback.id,
    userId: feedback.userId,
    message: feedback.message,
    criteria: feedback.criteria,
    resolved: feedback.resolved,
    createdAt: feedback.createdAt.toISOString(),
  });
});

router.get("/admin/analytics", authMiddleware, adminMiddleware, async (_req, res): Promise<void> => {
  const [userCount] = await db.select({ count: sql<number>`count(*)::int` }).from(usersTable);
  const [propCount] = await db.select({ count: sql<number>`count(*)::int` }).from(propertiesTable);
  const [interCount] = await db.select({ count: sql<number>`count(*)::int` }).from(interactionsTable);
  const [pendingCount] = await db.select({ count: sql<number>`count(*)::int` }).from(propertiesTable).where(eq(propertiesTable.status, "pending"));
  const [feedbackCount] = await db.select({ count: sql<number>`count(*)::int` }).from(feedbackTable).where(eq(feedbackTable.resolved, false));

  res.json({
    totalUsers: userCount.count,
    totalProperties: propCount.count,
    totalInteractions: interCount.count,
    pendingProperties: pendingCount.count,
    unresolvedFeedbacks: feedbackCount.count,
  });
});

export default router;
