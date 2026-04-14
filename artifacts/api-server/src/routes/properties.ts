import { Router, type IRouter } from "express";
import { eq, and, ilike, gte, lte, desc } from "drizzle-orm";
import { db, propertiesTable } from "@workspace/db";
import { CreatePropertyBody, UpdatePropertyBody, GetPropertyParams, ListPropertiesQueryParams } from "@workspace/api-zod";
import { authMiddleware } from "../middlewares/auth";
import jwt from "jsonwebtoken";
import type { AuthPayload } from "../middlewares/auth";

type PropertyType = "apartment" | "villa" | "commercial" | "land";
const VALID_PROPERTY_TYPES: PropertyType[] = ["apartment", "villa", "commercial", "land"];

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

function isValidPropertyType(value: string): value is PropertyType {
  return VALID_PROPERTY_TYPES.includes(value as PropertyType);
}

router.get("/properties", async (req, res): Promise<void> => {
  const params = ListPropertiesQueryParams.safeParse(req.query);
  const conditions = [eq(propertiesTable.status, "approved")];

  if (params.success) {
    if (params.data.search) {
      conditions.push(ilike(propertiesTable.title, `%${params.data.search}%`));
    }
    if (params.data.type && isValidPropertyType(params.data.type)) {
      conditions.push(eq(propertiesTable.propertyType, params.data.type));
    }
    if (params.data.location) {
      conditions.push(ilike(propertiesTable.location, `%${params.data.location}%`));
    }
    if (params.data.minPrice != null) {
      conditions.push(gte(propertiesTable.price, params.data.minPrice));
    }
    if (params.data.maxPrice != null) {
      conditions.push(lte(propertiesTable.price, params.data.maxPrice));
    }
  }

  const properties = await db.select().from(propertiesTable)
    .where(and(...conditions))
    .orderBy(desc(propertiesTable.createdAt));

  res.json(properties.map(formatProperty));
});

router.get("/properties/my", authMiddleware, async (req, res): Promise<void> => {
  const properties = await db.select().from(propertiesTable)
    .where(eq(propertiesTable.sellerId, req.user!.userId))
    .orderBy(desc(propertiesTable.createdAt));
  res.json(properties.map(formatProperty));
});

router.get("/properties/:id", async (req, res): Promise<void> => {
  const params = GetPropertyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [property] = await db.select().from(propertiesTable).where(eq(propertiesTable.id, params.data.id));
  if (!property) {
    res.status(404).json({ error: "العقار غير موجود" });
    return;
  }
  if (property.status !== "approved") {
    const authHeader = req.headers.authorization;
    let isOwnerOrAdmin = false;
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const jwtSecret = process.env.JWT_SECRET || process.env.SESSION_SECRET || "";
        const decoded = jwt.verify(authHeader.split(" ")[1], jwtSecret) as AuthPayload;
        isOwnerOrAdmin = decoded.userId === property.sellerId || decoded.role === "admin";
      } catch {}
    }
    if (!isOwnerOrAdmin) {
      res.status(404).json({ error: "العقار غير موجود" });
      return;
    }
  }
  res.json(formatProperty(property));
});

router.post("/properties", authMiddleware, async (req, res): Promise<void> => {
  if (req.user!.role !== "seller" && req.user!.role !== "admin") {
    res.status(403).json({ error: "يجب أن تكون بائعاً لإضافة عقار" });
    return;
  }

  const parsed = CreatePropertyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (!isValidPropertyType(parsed.data.propertyType)) {
    res.status(400).json({ error: "نوع العقار غير صالح" });
    return;
  }

  const [property] = await db.insert(propertiesTable).values({
    title: parsed.data.title,
    description: parsed.data.description,
    price: parsed.data.price,
    location: parsed.data.location,
    area: parsed.data.area,
    rooms: parsed.data.rooms ?? null,
    propertyType: parsed.data.propertyType,
    features: parsed.data.features || [],
    imageUrl: parsed.data.imageUrl,
    sellerId: req.user!.userId,
    status: "pending",
  }).returning();

  res.status(201).json(formatProperty(property));
});

router.patch("/properties/:id", authMiddleware, async (req, res): Promise<void> => {
  const params = GetPropertyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdatePropertyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(propertiesTable).where(eq(propertiesTable.id, params.data.id));
  if (!existing || existing.sellerId !== req.user!.userId) {
    res.status(404).json({ error: "العقار غير موجود" });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if (parsed.data.price !== undefined) updateData.price = parsed.data.price;
  if (parsed.data.location !== undefined) updateData.location = parsed.data.location;
  if (parsed.data.area !== undefined) updateData.area = parsed.data.area;
  if (parsed.data.rooms !== undefined) updateData.rooms = parsed.data.rooms;
  if (parsed.data.features !== undefined) updateData.features = parsed.data.features;
  if (parsed.data.imageUrl !== undefined) updateData.imageUrl = parsed.data.imageUrl;
  if (parsed.data.propertyType !== undefined) {
    if (!isValidPropertyType(parsed.data.propertyType)) {
      res.status(400).json({ error: "نوع العقار غير صالح" });
      return;
    }
    updateData.propertyType = parsed.data.propertyType;
  }

  const [property] = await db.update(propertiesTable)
    .set(updateData)
    .where(eq(propertiesTable.id, params.data.id))
    .returning();

  res.json(formatProperty(property));
});

router.delete("/properties/:id", authMiddleware, async (req, res): Promise<void> => {
  const params = GetPropertyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db.select().from(propertiesTable).where(eq(propertiesTable.id, params.data.id));
  if (!existing || existing.sellerId !== req.user!.userId) {
    res.status(404).json({ error: "العقار غير موجود" });
    return;
  }

  await db.delete(propertiesTable).where(eq(propertiesTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
