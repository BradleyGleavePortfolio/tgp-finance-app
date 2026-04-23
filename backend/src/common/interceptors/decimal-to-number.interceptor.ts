import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

// Prisma's Decimal (Decimal.js) serializes to a string in JSON, which would
// silently break the mobile client (it expects numbers). We cap money fields
// at DECIMAL(14, 2) ≈ $99 trillion max, which stays well within JS Number
// precision (2^53 ≈ 9 quadrillion), so converting to Number here is lossless.
// This interceptor runs BEFORE TransformInterceptor's envelope wrapping because
// walking the payload still works once it's wrapped — both interceptors run
// over the same handler return value.
export function convertDecimals(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Prisma.Decimal) return value.toNumber();
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      value[i] = convertDecimals(value[i]);
    }
    return value;
  }
  if (typeof value === 'object') {
    // Dates, Buffers, etc. — leave them alone.
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return value;
    for (const key of Object.keys(value as Record<string, unknown>)) {
      (value as Record<string, unknown>)[key] = convertDecimals(
        (value as Record<string, unknown>)[key],
      );
    }
    return value;
  }
  return value;
}

@Injectable()
export class DecimalToNumberInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data) => convertDecimals(data)));
  }
}
