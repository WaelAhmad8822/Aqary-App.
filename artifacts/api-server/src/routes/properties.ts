import { Router, type IRouter } from "express";
import { CreatePropertyBody, UpdatePropertyBody, GetPropertyParams, ListPropertiesQueryParams } from "@workspace/api-zod";
import { authMiddleware } from "../middlewares/auth";
import jwt from "jsonwebtoken";
import type { AuthPayload } from "../middlewares/auth";
import {
  ensureMongoConnection,
  PropertyModel,
  InteractionModel,
  toDateISOString,
  nextSequence,
} from "../lib/mongo";

type PropertyType = "apartment" | "villa" | "commercial" | "land";
const VALID_PROPERTY_TYPES: PropertyType[] = ["apartment", "villa", "commercial", "land"];

const router: IRouter = Router();

type PropertyDoc = {
  id: number;
  title: string;
  description: string;
  price: number;
  location: string;
  area: number;
  rooms?: number | null;
  propertyType: PropertyType;
  features: string[];
  imageUrl?: string | null;
  imageUrls?: string[];
  sellerId: number;
  status: "pending" | "approved" | "rejected";
  views: number;
  saves: number;
  contacts: number;
  createdAt: Date;
};

function formatProperty(p: PropertyDoc) {
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    price: p.price,
    location: p.location,
    area: p.area,
    rooms: p.rooms ?? null,
    propertyType: p.propertyType,
    features: p.features,
    imageUrl: p.imageUrl ?? p.imageUrls?.[0] ?? null,
    imageUrls: p.imageUrls ?? (p.imageUrl ? [p.imageUrl] : []),
    sellerId: p.sellerId,
    status: p.status,
    views: p.views,
    saves: p.saves,
    contacts: p.contacts,
    createdAt: toDateISOString(p.createdAt),
  };
}

function isValidPropertyType(value: string): value is PropertyType {
  return VALID_PROPERTY_TYPES.includes(value as PropertyType);
}

router.get("/properties", async (req, res): Promise<void> => {
  await ensureMongoConnection();
  const params = ListPropertiesQueryParams.safeParse(req.query);
  const query: Record<string, unknown> = { status: "approved" };

  if (params.success) {
    if (params.data.search) {
      query.title = { $regex: params.data.search, $options: "i" };
    }
    if (params.data.type && isValidPropertyType(params.data.type)) {
      query.propertyType = params.data.type;
    }
    if (params.data.location) {
      query.location = { $regex: params.data.location, $options: "i" };
    }
    if (params.data.minPrice != null || params.data.maxPrice != null) {
      query.price = {};
      if (params.data.minPrice != null) (query.price as Record<string, number>).$gte = params.data.minPrice;
      if (params.data.maxPrice != null) (query.price as Record<string, number>).$lte = params.data.maxPrice;
    }
  }

  const properties = await PropertyModel.find(query).sort({ createdAt: -1 }).lean();

  res.json(properties.map((p) => formatProperty(p as PropertyDoc)));
});

router.get("/properties/my", authMiddleware, async (req, res): Promise<void> => {
  await ensureMongoConnection();
  const properties = await PropertyModel.find({ sellerId: req.user!.userId }).sort({ createdAt: -1 }).lean();
  res.json(properties.map((p) => formatProperty(p as PropertyDoc)));
});

router.get("/properties/seller/activity", authMiddleware, async (req, res): Promise<void> => {
  const role = req.user!.role;
  if (role !== "seller" && role !== "admin") {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }

  await ensureMongoConnection();
  const sellerId = req.user!.userId;
  const myIds = await PropertyModel.find({ sellerId }).distinct("id");
  if (myIds.length === 0) {
    res.json({ recentInteractions: [] });
    return;
  }

  const recent = await InteractionModel.find({ propertyId: { $in: myIds } })
    .sort({ createdAt: -1 })
    .limit(40)
    .lean();

  const propIds = [...new Set(recent.map((r) => r.propertyId))];
  const props = await PropertyModel.find({ id: { $in: propIds } }).select({ id: 1, title: 1 }).lean();
  const titleById = new Map(props.map((p) => [p.id, p.title]));

  res.json({
    recentInteractions: recent.map((r) => ({
      id: r.id,
      propertyId: r.propertyId,
      propertyTitle: titleById.get(r.propertyId) ?? "",
      interactionType: r.interactionType,
      createdAt: toDateISOString(r.createdAt),
    })),
  });
});

router.get("/properties/:id", async (req, res): Promise<void> => {
  await ensureMongoConnection();
  const params = GetPropertyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const property = await PropertyModel.findOne({ id: params.data.id }).lean();
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
  await ensureMongoConnection();
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

  const normalizedImageUrls = (parsed.data.imageUrls ?? [])
    .map((url: string) => url.trim())
    .filter(Boolean)
    .slice(0, 3);
  if (normalizedImageUrls.length === 0 && parsed.data.imageUrl) {
    normalizedImageUrls.push(parsed.data.imageUrl);
  }

  const property = await PropertyModel.create({
    id: await nextSequence("properties"),
    title: parsed.data.title,
    description: parsed.data.description,
    price: parsed.data.price,
    location: parsed.data.location,
    area: parsed.data.area,
    rooms: parsed.data.rooms ?? null,
    propertyType: parsed.data.propertyType,
    features: parsed.data.features || [],
    imageUrl: normalizedImageUrls[0] ?? parsed.data.imageUrl ?? null,
    imageUrls: normalizedImageUrls,
    sellerId: req.user!.userId,
    status: "pending",
  });

  res.status(201).json(formatProperty(property));
});

router.patch("/properties/:id", authMiddleware, async (req, res): Promise<void> => {
  await ensureMongoConnection();
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

  const existing = await PropertyModel.findOne({ id: params.data.id }).lean();
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
  if (parsed.data.imageUrls !== undefined) {
    const normalizedImageUrls = parsed.data.imageUrls
      .map((url: string) => url.trim())
      .filter(Boolean)
      .slice(0, 3);
    updateData.imageUrls = normalizedImageUrls;
    updateData.imageUrl = normalizedImageUrls[0] ?? null;
  } else if (parsed.data.imageUrl !== undefined) {
    updateData.imageUrl = parsed.data.imageUrl;
    updateData.imageUrls = parsed.data.imageUrl ? [parsed.data.imageUrl] : [];
  }
  if (parsed.data.propertyType !== undefined) {
    if (!isValidPropertyType(parsed.data.propertyType)) {
      res.status(400).json({ error: "نوع العقار غير صالح" });
      return;
    }
    updateData.propertyType = parsed.data.propertyType;
  }

  const property = await PropertyModel.findOneAndUpdate(
    { id: params.data.id },
    updateData,
    { new: true },
  ).lean();
  if (!property) {
    res.status(404).json({ error: "العقار غير موجود" });
    return;
  }

  res.json(formatProperty(property));
});

router.delete("/properties/:id", authMiddleware, async (req, res): Promise<void> => {
  await ensureMongoConnection();
  const params = GetPropertyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const existing = await PropertyModel.findOne({ id: params.data.id }).lean();
  if (!existing || existing.sellerId !== req.user!.userId) {
    res.status(404).json({ error: "العقار غير موجود" });
    return;
  }

  await PropertyModel.deleteOne({ id: params.data.id });
  res.sendStatus(204);
});

export default router;
