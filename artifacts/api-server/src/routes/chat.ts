import { Router, type IRouter } from "express";
import { SendChatMessageBody } from "@workspace/api-zod";
import { authMiddleware } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { getMatchReasons } from "../lib/cosineSimilarity";
import {
  ensureMongoConnection,
  FeedbackModel,
  PropertyModel,
  ConversationStateModel,
  nextSequence,
} from "../lib/mongo";

const router: IRouter = Router();

interface ConversationSlots {
  role: "buyer" | "seller" | null;
  payment: "cash" | "installment" | null;
  budget: number | null;
  location: string | null;
  propertyType: string | null;
  features: string[];
}

interface MatchedPropertyResult {
  id: number;
  title: string;
  price: number;
  location: string;
  propertyType: string;
  propertyUrl: string;
  matchReasons: string[];
}

type PropertyCandidate = {
  id: number;
  title: string;
  price: number;
  location: string;
  propertyType: string;
  features: string[];
};

interface ConversationAnalysis {
  role: ConversationSlots["role"];
  payment: ConversationSlots["payment"];
  budget: number | null;
  location: string | null;
  propertyType: ConversationSlots["propertyType"];
  features: string[];
  isComplaint: boolean;
  complaintSummary: string | null;
  missingField: "role" | "payment" | "budget" | "location" | "propertyType" | "features" | null;
  nextQuestion: string | null;
  userSummary: string;
  shouldSearchProperties: boolean;
}

function stripJsonFromModelText(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch?.[1]) return fenceMatch[1].trim();
  return trimmed;
}

function safeParseExtractedSlots(raw: unknown): Partial<ConversationSlots> | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const out: Partial<ConversationSlots> = {};

  const role = obj.role;
  if (role === "buyer" || role === "seller" || role === null) out.role = role;

  const payment = obj.payment;
  if (payment === "cash" || payment === "installment" || payment === null) out.payment = payment;

  const budget = obj.budget;
  if (budget === null) out.budget = null;
  else if (typeof budget === "number" && Number.isFinite(budget) && budget > 0) out.budget = Math.round(budget);

  const location = obj.location;
  if (location === null) out.location = null;
  else if (typeof location === "string") out.location = location.trim() || null;

  const propertyType = obj.propertyType;
  if (propertyType === null) out.propertyType = null;
  else if (typeof propertyType === "string") out.propertyType = propertyType.trim() || null;

  const features = obj.features;
  if (Array.isArray(features)) {
    out.features = features.filter((x) => typeof x === "string").map((x) => x.trim()).filter(Boolean);
  }

  return out;
}

async function extractSlotsWithModel(
  conversationHistory: Array<{ role: string; content: string }>,
  userMessage: string,
): Promise<Partial<ConversationSlots> | null> {
  const JSON_EXTRACT_PROMPT = `أنت محلّل نوايا/كيانات لمساعد عقاري.
أعد "JSON فقط" بدون أي شرح أو نص إضافي.

استخرج الحقول التالية من المحادثة إن وُجدت:
- role: "buyer" | "seller" | null
- payment: "cash" | "installment" | null
- budget: number | null   (بالجنيه المصري)
- location: string | null (مثال: "القاهرة", "الجيزة", "العين السخنة")
- propertyType: "apartment" | "villa" | "commercial" | "land" | null
- features: string[]      (مثل: "مسبح", "حديقة", "شرفة", "أمن", "موقف سيارات")

قواعد:
- إذا لم تذكر المعلومة، اجعلها null (أو [] للميزات).
- لا تخمّن أرقام غير مذكورة.
- اكتب JSON صالحاً تماماً.`;

  const raw = await callOllama(JSON_EXTRACT_PROMPT, conversationHistory, userMessage);
  const jsonText = stripJsonFromModelText(raw);
  try {
    const parsed = JSON.parse(jsonText) as unknown;
    return safeParseExtractedSlots(parsed);
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.warn({ errMsg, sample: jsonText.slice(0, 200) }, "Failed to parse extracted slots JSON");
    return null;
  }
}

function parseConversationAnalysis(raw: string): ConversationAnalysis | null {
  try {
    const parsed = JSON.parse(stripJsonFromModelText(raw)) as Record<string, unknown>;
    const modelSlots = safeParseExtractedSlots(parsed) ?? {};
    const missing = parsed.missingField;
    const missingField = (missing === "role" || missing === "payment" || missing === "budget" || missing === "location" || missing === "propertyType" || missing === "features")
      ? missing
      : null;
    return {
      role: modelSlots.role ?? null,
      payment: modelSlots.payment ?? null,
      budget: modelSlots.budget ?? null,
      location: modelSlots.location ?? null,
      propertyType: modelSlots.propertyType ?? null,
      features: modelSlots.features ?? [],
      isComplaint: Boolean(parsed.isComplaint),
      complaintSummary: typeof parsed.complaintSummary === "string" ? parsed.complaintSummary : null,
      missingField,
      nextQuestion: typeof parsed.nextQuestion === "string" ? parsed.nextQuestion : null,
      userSummary: typeof parsed.userSummary === "string" ? parsed.userSummary : "",
      shouldSearchProperties: Boolean(parsed.shouldSearchProperties),
    };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.warn({ errMsg, sample: raw.slice(0, 240) }, "Failed to parse conversation analysis JSON");
    return null;
  }
}


function mergeSlots(base: ConversationSlots, incoming: Partial<ConversationSlots> | null | undefined): ConversationSlots {
  if (!incoming) return base;
  return {
    role: incoming.role ?? base.role,
    payment: incoming.payment ?? base.payment,
    budget: incoming.budget ?? base.budget,
    location: incoming.location ?? base.location,
    propertyType: incoming.propertyType ?? base.propertyType,
    features: (incoming.features && incoming.features.length > 0) ? incoming.features : base.features,
  };
}

async function analyzeConversationWithModel(
  conversationHistory: Array<{ role: string; content: string }>,
  userMessage: string,
): Promise<ConversationAnalysis | null> {
  const analysisPrompt = `أنت محلل محادثة لمساعد عقاري.
أرجع JSON فقط بالشكل التالي:
{
  "role": "buyer" | "seller" | null,
  "payment": "cash" | "installment" | null,
  "budget": number | null,
  "location": string | null,
  "propertyType": "apartment" | "villa" | "commercial" | "land" | null,
  "features": string[],
  "isComplaint": boolean,
  "complaintSummary": string | null,
  "missingField": "role" | "payment" | "budget" | "location" | "propertyType" | "features" | null,
  "nextQuestion": string | null,
  "userSummary": string,
  "shouldSearchProperties": boolean
}

قواعد:
- استخدم فقط المعلومات المذكورة من المستخدم.
- اسأل سؤالاً واحداً فقط في nextQuestion عند الحاجة.
- إذا المستخدم مشتكي/غاضب/يبلّغ مشكلة فاجعل isComplaint=true.
- shouldSearchProperties=true فقط عندما بيانات المشتري كافية لاقتراح نتائج جيدة.`;
  const raw = await callOllama(analysisPrompt, conversationHistory, userMessage);
  return parseConversationAnalysis(raw);
}

async function buildFinalReplyWithModel(
  analysis: ConversationAnalysis,
  matchedProperties: MatchedPropertyResult[],
  conversationHistory: Array<{ role: string; content: string }>,
  userMessage: string,
): Promise<string> {
  const responsePrompt = `أنت مساعد عقاري عربي.
اعطِ رداً مهنيًا ومختصراً (<=150 كلمة).
قواعد:
- سؤال واحد فقط في كل رسالة عند الحاجة.
- إذا isComplaint=true: اعتذر باحترام واذكر أن الملاحظة تم تسجيلها.
- إذا هناك عقارات مطابقة: قدّم ملخصاً قصيراً وتوجيه واضح للخطوة التالية.
- اعتمد على userSummary والمطابقات القادمة.
لا تُرجع JSON.`;

  const payload = {
    analysis,
    matches: matchedProperties.map((p) => ({
      id: p.id,
      title: p.title,
      price: p.price,
      location: p.location,
      propertyType: p.propertyType,
      propertyUrl: p.propertyUrl,
      reasons: p.matchReasons,
    })),
  };
  return callOllama(responsePrompt, conversationHistory, `${userMessage}\n\nDATA:\n${JSON.stringify(payload)}`);
}

function parseRankedIds(raw: string): number[] {
  const jsonText = stripJsonFromModelText(raw);
  const parsed = JSON.parse(jsonText) as unknown;
  if (!parsed || typeof parsed !== "object") return [];
  const ranked = (parsed as { rankedIds?: unknown }).rankedIds;
  if (!Array.isArray(ranked)) return [];
  return ranked.filter((id) => typeof id === "number" && Number.isFinite(id)).map((id) => Math.round(id));
}

async function rankPropertiesWithModel(
  slots: ConversationSlots,
  candidates: PropertyCandidate[],
  conversationHistory: Array<{ role: string; content: string }>,
  userMessage: string,
): Promise<number[] | null> {
  if (candidates.length === 0) return [];

  const rankingPrompt = `أنت نظام ترتيب عقارات.
أعد JSON فقط بالشكل التالي:
{"rankedIds":[...]}

رتّب معرفات العقارات من الأفضل للأسوأ بناءً على تفضيلات المستخدم.
معايير الترتيب: التوافق مع الميزانية، الموقع، نوع العقار، والمواصفات.
لا تضف أي نص خارج JSON.`;

  const candidatesJson = JSON.stringify(candidates, null, 2);
  const slotsJson = JSON.stringify(slots);
  const rankingMessage = `تفضيلات المستخدم (JSON): ${slotsJson}

العقارات المرشحة (JSON):
${candidatesJson}

رسالة المستخدم الأخيرة:
${userMessage}`;

  const raw = await callOllama(rankingPrompt, conversationHistory, rankingMessage);
  try {
    const rankedIds = parseRankedIds(raw);
    return rankedIds.length ? rankedIds : null;
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.warn({ errMsg, sample: raw.slice(0, 200) }, "Failed to parse property ranking JSON");
    return null;
  }
}

async function callOllama(systemPrompt: string, conversationHistory: Array<{ role: string; content: string }>, userMessage: string): Promise<string> {
  try {
    const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || process.env.LLM_BASE_URL || "";
    if (!ollamaBaseUrl) {
      logger.error("OLLAMA_BASE_URL (or LLM_BASE_URL) is not configured");
      return "عذراً، خدمة الدردشة غير مهيأة حالياً. يرجى المحاولة لاحقاً.";
    }

    const messages = [
      { role: "system", content: systemPrompt },
      ...conversationHistory.map(msg => ({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content,
      })),
      { role: "user", content: userMessage },
    ];

    const response = await fetch(`${ollamaBaseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(ollamaBaseUrl.includes("ngrok") ? { "ngrok-skip-browser-warning": "true" } : {}),
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

router.post("/chat", authMiddleware, async (req, res): Promise<void> => {
  await ensureMongoConnection();
  const parsed = SendChatMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { message, conversationHistory = [] } = parsed.data;
  const userId = req.user!.userId;
  const sessionHeader = req.headers["x-chat-session-id"];
  const sessionId = typeof sessionHeader === "string" && sessionHeader.trim() ? sessionHeader.trim().slice(0, 120) : "default";

  const historyItems = (conversationHistory || []).map((h: { role: string; content: string }) => ({
    role: h.role as string,
    content: h.content as string,
  }));
  const analysis = await analyzeConversationWithModel(historyItems, message);
  const isComplaint = analysis?.isComplaint ?? false;
  let feedbackCreated = false;

  if (isComplaint) {
    await FeedbackModel.create({
      id: await nextSequence("feedback"),
      userId,
      message,
      criteria: analysis?.complaintSummary || "شكوى من المحادثة",
    });
    feedbackCreated = true;
  }

  const stateDoc = await ConversationStateModel.findOne({ userId, sessionId }).lean();
  const persistedSlots: ConversationSlots = {
    role: (stateDoc?.slots?.role as ConversationSlots["role"]) ?? null,
    payment: (stateDoc?.slots?.payment as ConversationSlots["payment"]) ?? null,
    budget: stateDoc?.slots?.budget ?? null,
    location: stateDoc?.slots?.location ?? null,
    propertyType: stateDoc?.slots?.propertyType ?? null,
    features: Array.isArray(stateDoc?.slots?.features) ? stateDoc!.slots.features : [],
  };

  // Primary source is model analysis; fallback is lightweight structured extraction.
  const modelSlots = analysis ? {
    role: analysis.role,
    payment: analysis.payment,
    budget: analysis.budget,
    location: analysis.location,
    propertyType: analysis.propertyType,
    features: analysis.features,
  } : await extractSlotsWithModel(historyItems, message);
  const transientSlots: ConversationSlots = {
    role: modelSlots?.role ?? null,
    payment: modelSlots?.payment ?? null,
    budget: modelSlots?.budget ?? null,
    location: modelSlots?.location ?? null,
    propertyType: modelSlots?.propertyType ?? null,
    features: (modelSlots?.features && modelSlots.features.length > 0) ? modelSlots.features : [],
  };
  const slots = mergeSlots(persistedSlots, transientSlots);

  await ConversationStateModel.findOneAndUpdate(
    { userId, sessionId },
    {
      $set: {
        userId,
        sessionId,
        slots,
        lastUserMessage: message,
        updatedAt: new Date(),
      },
      $setOnInsert: {
        id: await nextSequence("conversationState"),
        createdAt: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  const nextQ = analysis?.nextQuestion ?? null;

  let matchedProperties: MatchedPropertyResult[] = [];

  const isBuyerReady = slots.role === "buyer" && slots.budget && slots.propertyType;
  const shouldSearch = analysis?.shouldSearchProperties ?? Boolean(isBuyerReady);

  if (shouldSearch && isBuyerReady && (nextQ === null || slots.location)) {
    const query: Record<string, unknown> = { status: "approved" };
    if (slots.budget) {
      query.price = { $lte: Math.round(slots.budget * 1.15) };
    }
    if (slots.propertyType) {
      query.propertyType = slots.propertyType;
    }
    if (slots.location) {
      query.location = slots.location;
    }

    let props = await PropertyModel.find(query).limit(5).lean();

    if (props.length === 0 && slots.location) {
      const fallbackQuery: Record<string, unknown> = { status: "approved" };
      if (slots.budget) fallbackQuery.price = { $lte: Math.round(slots.budget * 1.15) };
      if (slots.propertyType) fallbackQuery.propertyType = slots.propertyType;
      props = await PropertyModel.find(fallbackQuery).limit(5).lean();
    }

    const userPrefs = {
      maxBudget: slots.budget,
      preferredLocation: slots.location,
      preferredType: slots.propertyType,
      preferredFeatures: slots.features,
    };

    const candidates: PropertyCandidate[] = props.map((p) => ({
      id: p.id,
      title: p.title,
      price: p.price,
      location: p.location,
      propertyType: p.propertyType,
      features: p.features,
    }));

    matchedProperties = candidates.map(p => {
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
        propertyUrl: `/property/${p.id}`,
        matchReasons: reasons,
      };
    });

    const rankedIds = await rankPropertiesWithModel(slots, candidates, historyItems, message);
    if (rankedIds && rankedIds.length > 0) {
      const rankMap = new Map<number, number>();
      rankedIds.forEach((id, idx) => rankMap.set(id, idx));
      matchedProperties.sort((a, b) => {
        const ra = rankMap.get(a.id);
        const rb = rankMap.get(b.id);
        if (ra != null && rb != null) return ra - rb;
        if (ra != null) return -1;
        if (rb != null) return 1;
        return b.matchReasons.length - a.matchReasons.length;
      });
    } else {
      matchedProperties.sort((a, b) => b.matchReasons.length - a.matchReasons.length);
    }
    matchedProperties = matchedProperties.slice(0, 3);
  }

  const reply = await buildFinalReplyWithModel(
    analysis ?? {
      role: slots.role,
      payment: slots.payment,
      budget: slots.budget,
      location: slots.location,
      propertyType: slots.propertyType,
      features: slots.features,
      isComplaint,
      complaintSummary: null,
      missingField: null,
      nextQuestion: null,
      userSummary: "",
      shouldSearchProperties: matchedProperties.length > 0,
    },
    matchedProperties,
    historyItems,
    message,
  );

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
