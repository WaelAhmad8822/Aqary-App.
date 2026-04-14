import { db, usersTable, propertiesTable, userPreferencesTable } from "@workspace/db";
import bcrypt from "bcryptjs";

async function seed() {
  console.log("Seeding database...");

  const adminHash = await bcrypt.hash("admin123", 10);
  const sellerHash = await bcrypt.hash("seller123", 10);
  const buyerHash = await bcrypt.hash("buyer123", 10);

  const [admin] = await db.insert(usersTable).values({
    name: "مدير النظام",
    email: "admin@aqary.com",
    passwordHash: adminHash,
    role: "admin",
    phone: "01000000000",
  }).onConflictDoNothing().returning();

  const [seller] = await db.insert(usersTable).values({
    name: "أحمد محمد",
    email: "seller@aqary.com",
    passwordHash: sellerHash,
    role: "seller",
    phone: "01111111111",
  }).onConflictDoNothing().returning();

  const [buyer] = await db.insert(usersTable).values({
    name: "سارة أحمد",
    email: "buyer@aqary.com",
    passwordHash: buyerHash,
    role: "buyer",
    phone: "01222222222",
  }).onConflictDoNothing().returning();

  if (!seller) {
    console.log("Users already exist, skipping seed.");
    process.exit(0);
  }

  await db.insert(userPreferencesTable).values([
    { userId: admin!.id },
    { userId: seller!.id },
    { userId: buyer!.id, preferredLocation: "القاهرة", maxBudget: 2000000, preferredType: "apartment", preferredFeatures: ["مصعد", "أمن", "موقف سيارات"] },
  ]).onConflictDoNothing();

  const properties = [
    {
      title: "شقة فاخرة في التجمع الخامس",
      description: "شقة 3 غرف نوم بتشطيب سوبر لوكس في قلب التجمع الخامس، قريبة من الجامعة الأمريكية والخدمات الأساسية.",
      price: 1800000,
      location: "التجمع الخامس",
      area: 180,
      rooms: 3,
      propertyType: "apartment" as const,
      features: ["مصعد", "أمن", "موقف سيارات", "تكييف مركزي"],
      imageUrl: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800",
      sellerId: seller!.id,
      status: "approved" as const,
    },
    {
      title: "فيلا مستقلة في الشيخ زايد",
      description: "فيلا مستقلة 5 غرف نوم مع حديقة خاصة ومسبح في كمبوند راقي بالشيخ زايد.",
      price: 8500000,
      location: "الشيخ زايد",
      area: 450,
      rooms: 5,
      propertyType: "villa" as const,
      features: ["مسبح", "حديقة", "أمن", "موقف سيارات", "تكييف مركزي"],
      imageUrl: "https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800",
      sellerId: seller!.id,
      status: "approved" as const,
    },
    {
      title: "شقة بإطلالة بحرية في الإسكندرية",
      description: "شقة أمام البحر مباشرة في سيدي جابر، 2 غرف نوم مع بلكونة واسعة وإطلالة خلابة على البحر.",
      price: 1200000,
      location: "الإسكندرية",
      area: 120,
      rooms: 2,
      propertyType: "apartment" as const,
      features: ["إطلالة بحرية", "شرفة", "مصعد"],
      imageUrl: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800",
      sellerId: seller!.id,
      status: "approved" as const,
    },
    {
      title: "محل تجاري في وسط القاهرة",
      description: "محل تجاري 80 متر في شارع رئيسي بوسط البلد، مناسب لجميع الأنشطة التجارية.",
      price: 3500000,
      location: "القاهرة",
      area: 80,
      rooms: null,
      propertyType: "commercial" as const,
      features: ["موقف سيارات", "أمن"],
      imageUrl: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=800",
      sellerId: seller!.id,
      status: "approved" as const,
    },
    {
      title: "شقة في المعادي الجديدة",
      description: "شقة 2 غرف نوم بتشطيب كامل في المعادي الجديدة، قريبة من المترو والمدارس.",
      price: 950000,
      location: "المعادي",
      area: 100,
      rooms: 2,
      propertyType: "apartment" as const,
      features: ["مصعد", "أمن"],
      imageUrl: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800",
      sellerId: seller!.id,
      status: "approved" as const,
    },
    {
      title: "أرض للبيع في 6 أكتوبر",
      description: "قطعة أرض 500 متر مربع في منطقة سكنية هادئة بمدينة 6 أكتوبر، مناسبة للبناء السكني.",
      price: 2200000,
      location: "6 أكتوبر",
      area: 500,
      rooms: null,
      propertyType: "land" as const,
      features: [],
      imageUrl: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800",
      sellerId: seller!.id,
      status: "approved" as const,
    },
    {
      title: "شقة بنتهاوس في الساحل الشمالي",
      description: "بنتهاوس فاخر 4 غرف نوم مع تراس واسع وإطلالة مباشرة على البحر في الساحل الشمالي.",
      price: 5500000,
      location: "الساحل الشمالي",
      area: 250,
      rooms: 4,
      propertyType: "apartment" as const,
      features: ["إطلالة بحرية", "شرفة", "مسبح", "أمن", "تكييف مركزي"],
      imageUrl: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800",
      sellerId: seller!.id,
      status: "approved" as const,
    },
    {
      title: "شقة معلقة - بانتظار الموافقة",
      description: "شقة جديدة لم تتم الموافقة عليها بعد.",
      price: 1500000,
      location: "الجيزة",
      area: 150,
      rooms: 3,
      propertyType: "apartment" as const,
      features: ["مصعد"],
      imageUrl: "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=800",
      sellerId: seller!.id,
      status: "pending" as const,
    },
  ];

  await db.insert(propertiesTable).values(properties);

  console.log("Seed complete!");
  console.log("Admin: admin@aqary.com / admin123");
  console.log("Seller: seller@aqary.com / seller123");
  console.log("Buyer: buyer@aqary.com / buyer123");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
