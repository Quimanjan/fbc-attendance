import type { Request, Response, NextFunction, RequestHandler } from 'express';

/** Lets async route handlers report errors to Express. */
export const h = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const text = (v: unknown, max = 255): string => String(v ?? '').trim().slice(0, max);
export const int = (v: unknown): number => { const n = parseInt(String(v), 10); return Number.isFinite(n) ? n : 0; };
export const nullableId = (v: unknown): number | null => int(v) || null;

export function required(body: Record<string, unknown>, fields: string[]) {
  for (const f of fields) if (!text(body[f])) throw new HttpError(400, `${f.replace(/_/g, ' ')} is required.`);
}

export const STATUSES = ['Present', 'Absent', 'Late', 'Excused'] as const;
export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
