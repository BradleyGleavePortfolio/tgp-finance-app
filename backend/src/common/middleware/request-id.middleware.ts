import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

// Correlation IDs for every incoming request. The middleware honours an
// upstream `x-request-id` header (set by a load balancer or another service
// that already minted one) and otherwise generates a UUID. The id is:
//   - attached to req.id so any controller / service can log with it
//   - echoed back in the response x-request-id header so the mobile client
//     can include it in error reports
//
// Ported from the fitness backend pattern. Deliberately framework-agnostic
// (plain Express middleware) so it composes with helmet/cors before Nest's
// guard chain runs.
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request & { id?: string }, res: Response, next: NextFunction): void {
    const inbound = req.header('x-request-id');
    const id = inbound && inbound.length > 0 && inbound.length <= 128 ? inbound : randomUUID();
    req.id = id;
    res.setHeader('x-request-id', id);
    next();
  }
}
