import { Router, type IRouter } from "express";
import { eq, and, lte, gte } from "drizzle-orm";
import { db, propertiesTable, feedbackTable } from "@workspace/db";
import { SendChatMessageBody } from "@workspace/api-zod";
import { authMiddleware } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { getMatchReasons } from "../lib/cosineSimilarity";

const router: IRouter = Router();

const COMPLAINT_KEYWORDS = ["مشكلة", "شكوى", "لا يوجد", "غير متوفر", "خطأ", "سيء", "مشاكل"];

interface ConversationSlots {
  role: "buyer" | "seller" | null;
  payment: "cash" | "installment" | null;
  budget: number | null;
  location: string | null;
  propertyType: string | null;
  features: string[];
}

const LOCATION_KEYWORDS: Record<string, string> = {
  "القاهرة": "القاهرة", "الجيزة": "الجيزة", "الإسكندرية": "الإسكندرية",
  "المنصورة": "المنصورة", "طنطا": "طنطا", "أسيوط": "أسيوط",
  "الساحل الشمالي": "الساحل الشمالي", "العين السخنة": "العين السخنة",
  "6 أكتوبر": "6 أكتوبر", "التجمع الخامس": "التجمع الخامس",
  "المعادي": "المعادي", "الشيخ زايد": "الشيخ زايد",
  "مصر الجديدة": "القاهرة", "مدينة نصر": "القاهرة",
};

const TYPE_KEYWORDS: Record<string, string> = {
  "شقة": "apartment", "شقه": "apartment", "apartment": "apartment",
  "فيلا": "villa", "فيلة": "villa", "villa": "villa",
  "تجاري": "commercial", "محل": "commercial", "مكتب": "commercial",
  "أرض": "land", "ارض": "land",
};

function extractSlots(conversationHistory: Array<{ role: string; content: string }>, currentMessage: string): ConversationSlots {
  const allText = conversationHistory.map(h => h.content).join(" ") + " " + currentMessage;
  const userText = conversationHistory.filter(h => h.role === "user").map(h => h.content).join(" ") + " " + currentMessage;

  const slots: ConversationSlots = {
    role: null,
    payment: null,
    budget: null,
    location: null,
    propertyType: null,
    features: [],
  };

  if (userText.includes("مشتري") || userText.includes("أشتري") || userText.includes("شراء") || userText.includes("بحث")) {
    slots.role = "buyer";
  } else if (userText.includes("بائع") || userText.includes("أبيع") || userText.includes("بيع")) {
    slots.role = "seller";
  }

  if (userText.includes("كاش") || userText.includes("نقد") || userText.includes("نقدا") || userText.includes("نقداً")) {
    slots.payment = "cash";
  } else if (userText.includes("تقسيط") || userText.includes("تمويل")) {
    slots.payment = "installment";
  }

  const budgetMatch = userText.match(/(\d[\d,]*)\s*(جنيه|ج\.م|مليون|ألف)?/);
  if (budgetMatch) {
    let budget = parseInt(budgetMatch[1].replace(/,/g, ""), 10);
    if (allText.includes("مليون") || budgetMatch[2] === "مليون") budget *= 1000000;
    else if (allText.includes("ألف") || budgetMatch[2] === "ألف") budget *= 1000;
    if (budget < 1000) budget *= 1000000;
    slots.budget = budget;
  }

  for (const [keyword, loc] of Object.entries(LOCATION_KEYWORDS)) {
    if (userText.includes(keyword)) {
      slots.location = loc;
      break;
    }
  }

  for (const [keyword, type] of Object.entries(TYPE_KEYWORDS)) {
    if (userText.includes(keyword)) {
      slots.propertyType = type;
      break;
    }
  }

  const featureKeywords = ["مسبح", "حديقة", "إطلالة بحرية", "موقف سيارات", "مصعد", "أمن", "تكييف مركزي", "شرفة", "جراج", "حمام سباحة"];
  for (const feature of featureKeywords) {
    if (userText.includes(feature)) {
      slots.features.push(feature === "حمام سباحة" ? "مسبح" : feature === "جراج" ? "موقف سيارات" : feature);
    }
  }

  return slots;
}

function getNextQuestion(slots: ConversationSlots): string | null {
  if (!slots.role) return null;
  if (slots.role === "buyer") {
    if (!slots.payment) return "payment";
    if (slots.payment === "installment") return "installment_redirect";
    if (!slots.budget) return "budget";
    if (!slots.location) return "location";
    if (!slots.propertyType) return "type";
    return "ready";
  }
  return null;
}

const OLLAMA_BASE_URL = "https://remission-copilot-why.ngrok-free.dev";

async function callOllama(systemPrompt: string, conversationHistory: Array<{ role: string; content: string }>, userMessage: string): Promise<string> {
  try {
    const messages = [
      { role: "system", content: systemPrompt },
      ...conversationHistory.map(msg => ({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content,
      })),
      { role: "user", content: userMessage },
    ];

    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify({
        model: "llama3",
        messages,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error({ status: response.status, error: errorText }, "Ollama API error");
      return "عذراً، حدث خطأ في المعالجة. يرجى المحاولة مرة أخرى.";
    }

    const data = await response.json() as { message?: { content?: string } };
    return data.message?.content || "عذراً، لم أتمكن من معالجة طلبك.";
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error({ error: errMsg }, "Ollama API error");
    return "عذراً، حدث خطأ في المعالجة. يرجى المحاولة مرة أخرى.";
  }
}

const SYSTEM_PROMPT = `أنت مساعد عقاري ذكي اسمك "عقاري". تعمل ضمن منصة عقارية مصرية.

قواعد صارمة يجب اتباعها:
1. اسأل سؤالاً واحداً فقط في كل رسالة. لا تسأل أكثر من سؤال واحد أبداً.
2. استخدم اللغة العربية الفصحى الحديثة فقط.
3. كن محترفاً ودافئاً وجديراً بالثقة.
4. الحد الأقصى 150 كلمة لكل رد.

تدفق المحادثة:
- ابدأ بالسؤال: "أهلاً بك! هل أنت (مشتري) أم (بائع)؟"

إذا كان المستخدم مشتري:
1. اسأل عن طريقة الدفع: "كيف تفضل الدفع؟ نقداً (كاش) أم تمويلاً (تقسيط)؟"
2. إذا اختار التقسيط: أجب "لكن حالياً خدمة التقسيط والتمويل العقاري غير متاحة مباشرة في النظام. هل تود الاستمرار بخيار الدفع الكاش؟"
3. إذا اختار الكاش أو وافق على الكاش:
   - اسأل عن الميزانية
   - ثم الموقع المفضل
   - ثم نوع العقار (شقة، فيلا، تجاري)
   - ثم المواصفات المطلوبة
4. بعد جمع البيانات، سأعرض العقارات المناسبة مع شرح سبب التوافق.

إذا كان المستخدم بائع:
1. اسأل عن نوع العقار
2. اسأل عن الهدف (سرعة البيع أم أفضل سعر)
3. اسأل عن معلومات التواصل
4. اسأل عن تجهيز صفحة العرض

إذا ذكر المستخدم مشكلة أو شكوى، اعتذر وأخبره أنه تم تسجيل ملاحظته.`;

router.post("/chat", authMiddleware, async (req, res): Promise<void> => {
  const parsed = SendChatMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { message, conversationHistory = [] } = parsed.data;
  const userId = req.user!.userId;

  const isComplaint = COMPLAINT_KEYWORDS.some(kw => message.includes(kw));
  let feedbackCreated = false;

  if (isComplaint) {
    await db.insert(feedbackTable).values({
      userId,
      message,
      criteria: "شكوى من المحادثة",
    });
    feedbackCreated = true;
  }

  const historyItems = (conversationHistory || []).map(h => ({
    role: h.role as string,
    content: h.content as string,
  }));

  const slots = extractSlots(historyItems, message);
  const nextQ = getNextQuestion(slots);

  const reply = await callOllama(SYSTEM_PROMPT, historyItems, message);

  interface MatchedPropertyResult {
    id: number;
    title: string;
    price: number;
    location: string;
    propertyType: string;
    matchReasons: string[];
  }

  let matchedProperties: MatchedPropertyResult[] = [];

  const isBuyerReady = slots.role === "buyer" && slots.budget && slots.propertyType;

  if (isBuyerReady && (nextQ === "ready" || slots.location)) {
    const conditions = [eq(propertiesTable.status, "approved")];
    if (slots.budget) {
      conditions.push(lte(propertiesTable.price, Math.round(slots.budget * 1.15)));
    }
    if (slots.propertyType) {
      conditions.push(eq(propertiesTable.propertyType, slots.propertyType as "apartment" | "villa" | "commercial" | "land"));
    }
    if (slots.location) {
      conditions.push(eq(propertiesTable.location, slots.location));
    }

    let props = await db.select().from(propertiesTable).where(and(...conditions)).limit(5);

    if (props.length === 0 && slots.location) {
      const fallbackConditions = [eq(propertiesTable.status, "approved")];
      if (slots.budget) fallbackConditions.push(lte(propertiesTable.price, Math.round(slots.budget * 1.15)));
      if (slots.propertyType) fallbackConditions.push(eq(propertiesTable.propertyType, slots.propertyType as "apartment" | "villa" | "commercial" | "land"));
      props = await db.select().from(propertiesTable).where(and(...fallbackConditions)).limit(5);
    }

    const userPrefs = {
      maxBudget: slots.budget,
      preferredLocation: slots.location,
      preferredType: slots.propertyType,
      preferredFeatures: slots.features,
    };

    matchedProperties = props.map(p => {
      const reasons = getMatchReasons(
        { price: p.price, location: p.location, propertyType: p.propertyType, features: p.features },
        userPrefs
      );
      return {
        id: p.id,
        title: p.title,
        price: p.price,
        location: p.location,
        propertyType: p.propertyType,
        matchReasons: reasons,
      };
    });

    matchedProperties.sort((a, b) => b.matchReasons.length - a.matchReasons.length);
    matchedProperties = matchedProperties.slice(0, 3);
  }

  const response: { reply: string; properties?: MatchedPropertyResult[]; feedbackCreated?: boolean } = { reply };
  if (matchedProperties.length > 0) {
    response.properties = matchedProperties;
  }
  if (feedbackCreated) {
    response.feedbackCreated = true;
  }

  res.json(response);
});

export default router;
