import { Router, type IRouter } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { db, usersTable, userPreferencesTable, interactionsTable, feedbackTable, propertiesTable } from "@workspace/db";
import { UpdateUserPreferencesBody } from "@workspace/api-zod";
import { authMiddleware } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/user/preferences", authMiddleware, async (req, res): Promise<void> => {
  const [prefs] = await db.select().from(userPreferencesTable).where(eq(userPreferencesTable.userId, req.user!.userId));
  if (!prefs) {
    res.json({ preferredLocation: null, maxBudget: null, preferredType: null, preferredFeatures: [] });
    return;
  }
  res.json({
    preferredLocation: prefs.preferredLocation,
    maxBudget: prefs.maxBudget,
    preferredType: prefs.preferredType,
    preferredFeatures: prefs.preferredFeatures,
  });
});

router.put("/user/preferences", authMiddleware, async (req, res): Promise<void> => {
  const parsed = UpdateUserPreferencesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = req.user!.userId;
  const [existing] = await db.select().from(userPreferencesTable).where(eq(userPreferencesTable.userId, userId));

  const updateData: Partial<{
    preferredLocation: string | null;
    maxBudget: number | null;
    preferredType: string | null;
    preferredFeatures: string[];
    updatedAt: Date;
  }> = {};
  if (parsed.data.preferredLocation !== undefined) updateData.preferredLocation = parsed.data.preferredLocation;
  if (parsed.data.maxBudget !== undefined) updateData.maxBudget = parsed.data.maxBudget;
  if (parsed.data.preferredType !== undefined) updateData.preferredType = parsed.data.preferredType;
  if (parsed.data.preferredFeatures !== undefined) updateData.preferredFeatures = parsed.data.preferredFeatures;
  updateData.updatedAt = new Date();

  if (existing) {
    await db.update(userPreferencesTable).set(updateData).where(eq(userPreferencesTable.userId, userId));
  } else {
    await db.insert(userPreferencesTable).values({ userId, ...updateData });
  }

  const [prefs] = await db.select().from(userPreferencesTable).where(eq(userPreferencesTable.userId, userId));
  res.json({
    preferredLocation: prefs.preferredLocation,
    maxBudget: prefs.maxBudget,
    preferredType: prefs.preferredType,
    preferredFeatures: prefs.preferredFeatures,
  });
});

router.get("/user/saved", authMiddleware, async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const savedInteractions = await db.select({ propertyId: interactionsTable.propertyId })
    .from(interactionsTable)
    .where(and(eq(interactionsTable.userId, userId), eq(interactionsTable.interactionType, "save")));

  const propertyIds = [...new Set(savedInteractions.map(i => i.propertyId))];
  if (propertyIds.length === 0) {
    res.json([]);
    return;
  }

  const properties = await db.select().from(propertiesTable).where(inArray(propertiesTable.id, propertyIds));
  res.json(properties.map(p => ({
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
  })));
});

router.delete("/user/delete", authMiddleware, async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  await db.delete(interactionsTable).where(eq(interactionsTable.userId, userId));
  await db.delete(feedbackTable).where(eq(feedbackTable.userId, userId));
  await db.delete(userPreferencesTable).where(eq(userPreferencesTable.userId, userId));
  await db.delete(usersTable).where(eq(usersTable.id, userId));
  res.sendStatus(204);
});

export default router;
