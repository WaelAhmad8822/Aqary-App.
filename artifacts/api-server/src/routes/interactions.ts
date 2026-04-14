import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, interactionsTable, propertiesTable } from "@workspace/db";
import { TrackInteractionBody } from "@workspace/api-zod";
import { authMiddleware } from "../middlewares/auth";
import { INTERACTION_WEIGHTS } from "../lib/cosineSimilarity";

type InteractionType = "view" | "save" | "contact" | "scroll" | "time_spent";
const VALID_INTERACTION_TYPES: InteractionType[] = ["view", "save", "contact", "scroll", "time_spent"];

function isValidInteractionType(value: string): value is InteractionType {
  return VALID_INTERACTION_TYPES.includes(value as InteractionType);
}

const router: IRouter = Router();

router.post("/track", authMiddleware, async (req, res): Promise<void> => {
  const parsed = TrackInteractionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { propertyId, interactionType, seconds } = parsed.data;

  if (!isValidInteractionType(interactionType)) {
    res.status(400).json({ error: "نوع التفاعل غير صالح" });
    return;
  }

  const weight = INTERACTION_WEIGHTS[interactionType] || 1;

  await db.insert(interactionsTable).values({
    userId: req.user!.userId,
    propertyId,
    interactionType,
    weight,
    seconds: seconds || null,
  });

  if (interactionType === "view") {
    await db.update(propertiesTable)
      .set({ views: sql`${propertiesTable.views} + 1` })
      .where(eq(propertiesTable.id, propertyId));
  } else if (interactionType === "save") {
    await db.update(propertiesTable)
      .set({ saves: sql`${propertiesTable.saves} + 1` })
      .where(eq(propertiesTable.id, propertyId));
  } else if (interactionType === "contact") {
    await db.update(propertiesTable)
      .set({ contacts: sql`${propertiesTable.contacts} + 1` })
      .where(eq(propertiesTable.id, propertyId));
  }

  res.status(201).json({ message: "تم تسجيل التفاعل" });
});

export default router;
