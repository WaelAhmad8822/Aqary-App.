import mongoose, { Schema, model } from "mongoose";

const mongoUri = process.env.MONGODB_URI || process.env.DATABASE_URL;

let connectPromise: Promise<typeof mongoose> | null = null;

export function ensureMongoConnection(): Promise<typeof mongoose> {
  if (!mongoUri) {
    return Promise.reject(
      new Error("MONGODB_URI (or DATABASE_URL) must be set for database access."),
    );
  }
  const uri = mongoUri;
  if (!connectPromise) {
    connectPromise = mongoose.connect(uri, {
      dbName: process.env.MONGODB_DB_NAME || "aqary",
    });
  }
  return connectPromise;
}

const counterSchema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { versionKey: false },
);

const userSchema = new Schema(
  {
    id: { type: Number, required: true, unique: true, index: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    phone: { type: String, default: null },
    role: {
      type: String,
      enum: ["buyer", "seller", "admin"],
      required: true,
      default: "buyer",
    },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  { versionKey: false },
);

const propertySchema = new Schema(
  {
    id: { type: Number, required: true, unique: true, index: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    price: { type: Number, required: true },
    location: { type: String, required: true },
    area: { type: Number, required: true },
    rooms: { type: Number, default: null },
    propertyType: {
      type: String,
      enum: ["apartment", "villa", "commercial", "land"],
      required: true,
    },
    features: { type: [String], required: true, default: [] },
    imageUrl: { type: String, default: null },
    imageUrls: { type: [String], required: true, default: [] },
    sellerId: { type: Number, required: true, index: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      required: true,
      default: "pending",
    },
    views: { type: Number, required: true, default: 0 },
    saves: { type: Number, required: true, default: 0 },
    contacts: { type: Number, required: true, default: 0 },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  { versionKey: false },
);

const interactionSchema = new Schema(
  {
    id: { type: Number, required: true, unique: true, index: true },
    userId: { type: Number, required: true, index: true },
    propertyId: { type: Number, required: true, index: true },
    interactionType: {
      type: String,
      enum: ["view", "save", "contact", "scroll", "time_spent"],
      required: true,
    },
    weight: { type: Number, required: true, default: 1 },
    seconds: { type: Number, default: null },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  { versionKey: false },
);

const feedbackSchema = new Schema(
  {
    id: { type: Number, required: true, unique: true, index: true },
    userId: { type: Number, default: null, index: true },
    message: { type: String, required: true },
    criteria: { type: String, default: null },
    resolved: { type: Boolean, required: true, default: false },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  { versionKey: false },
);

const preferenceSchema = new Schema(
  {
    id: { type: Number, required: true, unique: true, index: true },
    userId: { type: Number, required: true, unique: true, index: true },
    preferredLocation: { type: String, default: null },
    maxBudget: { type: Number, default: null },
    preferredType: { type: String, default: null },
    preferredFeatures: { type: [String], required: true, default: [] },
    updatedAt: { type: Date, required: true, default: Date.now },
  },
  { versionKey: false },
);

const pageViewSchema = new Schema(
  {
    id: { type: Number, required: true, unique: true, index: true },
    userId: { type: Number, default: null, index: true },
    path: { type: String, required: true, index: true },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  { versionKey: false },
);

const conversationStateSchema = new Schema(
  {
    id: { type: Number, required: true, unique: true, index: true },
    userId: { type: Number, required: true, index: true },
    sessionId: { type: String, required: true, index: true },
    slots: {
      role: { type: String, enum: ["buyer", "seller"], default: null },
      payment: { type: String, enum: ["cash", "installment"], default: null },
      budget: { type: Number, default: null },
      location: { type: String, default: null },
      propertyType: { type: String, default: null },
      features: { type: [String], required: true, default: [] },
    },
    lastUserMessage: { type: String, default: "" },
    updatedAt: { type: Date, required: true, default: Date.now, index: true },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  { versionKey: false },
);
conversationStateSchema.index({ userId: 1, sessionId: 1 }, { unique: true });

export const CounterModel = model("Counter", counterSchema);
export const UserModel = model("User", userSchema);
export const PropertyModel = model("Property", propertySchema);
export const InteractionModel = model("Interaction", interactionSchema);
export const FeedbackModel = model("Feedback", feedbackSchema);
export const UserPreferenceModel = model("UserPreference", preferenceSchema);
export const PageViewModel = model("PageView", pageViewSchema);
export const ConversationStateModel = model("ConversationState", conversationStateSchema);

export async function nextSequence(name: string): Promise<number> {
  const counter = await CounterModel.findOneAndUpdate(
    { name },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();
  return counter!.seq;
}

export function toDateISOString(value: Date): string {
  return value.toISOString();
}
