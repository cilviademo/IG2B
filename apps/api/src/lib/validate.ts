import type { Request, Response, NextFunction } from "express";
import type { ZodTypeAny } from "zod";

/** Body-validation middleware: replaces req.body with the parsed value. */
export function validate(schema: ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
    }
    req.body = parsed.data;
    next();
  };
}
