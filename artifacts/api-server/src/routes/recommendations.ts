import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, propertiesTable, interactionsTable, userPreferencesTable } from "@workspace/db";
import { authMiddleware } from "../middlewares/auth";
import {
  cosineSimilarity,
  buildPropertyVector,
  buildUserVector,
  getMatchReasons,
  INTERACTION_WEIGHTS,
} from "../lib/cosineSimilarity";

const router: IRouter = Router();

router.get("/recommendations", authMiddleware, async (req, res): Promise<void> => {
  const userId = req.user!.userId;

  const [prefs] = await db.select().from(userPreferencesTable).where(eq(userPreferencesTable.userId, userId));

  const properties = await db.select().from(propertiesTable).where(eq(propertiesTable.status, "approved"));

  if (properties.length === 0) {
    res.json([]);
    return;
  }

  const interactions = await db.select().from(interactionsTable).where(eq(interactionsTable.userId, userId));

  const behaviorScores: Record<number, number> = {};
  for (const interaction of interactions) {
    const weight = INTERACTION_WEIGHTS[interaction.interactionType] || 1;
    const effectiveWeight = interaction.interactionType === "time_spent" && interaction.seconds
      ? weight * interaction.seconds
      : weight;
    behaviorScores[interaction.propertyId] = (behaviorScores[interaction.propertyId] || 0) + effectiveWeight;
  }

  const maxBehavior = Math.max(...Object.values(behaviorScores), 1);

  const userVector = prefs
    ? buildUserVector(prefs.maxBudget, prefs.preferredLocation, prefs.preferredType, prefs.preferredFeatures)
    : buildUserVector(null, null, null, []);

  const scored = properties.map((property) => {
    const propertyVector = buildPropertyVector(
      property.price,
      property.location,
      property.propertyType,
      property.features,
    );

    const contentScore = cosineSimilarity(userVector, propertyVector);
    const normalizedBehavior = (behaviorScores[property.id] || 0) / maxBehavior;
    const finalScore = contentScore * 0.6 + normalizedBehavior * 0.4;

    const matchReasons = prefs
      ? getMatchReasons(
          { price: property.price, location: property.location, propertyType: property.propertyType, features: property.features },
          { maxBudget: prefs.maxBudget, preferredLocation: prefs.preferredLocation, preferredType: prefs.preferredType, preferredFeatures: prefs.preferredFeatures },
        )
      : ["مقترح لك"];

    return {
      id: property.id,
      title: property.title,
      description: property.description,
      price: property.price,
      location: property.location,
      area: property.area,
      rooms: property.rooms,
      propertyType: property.propertyType,
      features: property.features,
      imageUrl: property.imageUrl,
      sellerId: property.sellerId,
      status: property.status,
      views: property.views,
      saves: property.saves,
      contacts: property.contacts,
      createdAt: property.createdAt.toISOString(),
      matchScore: Math.round(finalScore * 100),
      matchReasons,
    };
  });

  scored.sort((a, b) => b.matchScore - a.matchScore);
  res.json(scored.slice(0, 10));
});

export default router;
