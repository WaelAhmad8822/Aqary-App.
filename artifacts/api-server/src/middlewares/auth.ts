import { type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET or SESSION_SECRET must be set");
  }
  return secret;
}

const JWT_SECRET: string = getJwtSecret();

export interface AuthPayload {
  userId: number;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "غير مصرح" });
    return;
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthPayload;
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "رمز غير صالح" });
    return;
  }
}

export function adminMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== "admin") {
    res.status(403).json({ error: "غير مصرح - مدير فقط" });
    return;
  }
  next();
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}
