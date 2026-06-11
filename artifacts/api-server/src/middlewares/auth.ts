import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../routes/auth";

export interface AuthRequest extends Request {
  user?: { id: number; email: string; role: string; name: string };
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  req.user = payload;
  next();
}
