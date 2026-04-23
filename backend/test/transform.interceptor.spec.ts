import { of, firstValueFrom } from 'rxjs';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

describe('TransformInterceptor', () => {
  it('wraps handler output in { data, success, timestamp } envelope', async () => {
    const interceptor = new TransformInterceptor<unknown>();
    const ctx = {} as ExecutionContext;
    const next: CallHandler = { handle: () => of({ id: 'user-1', balance: 100 }) };

    const result = await firstValueFrom(interceptor.intercept(ctx, next));

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ id: 'user-1', balance: 100 });
    expect(typeof result.timestamp).toBe('string');
    // Must be ISO-8601 timestamp
    expect(() => new Date(result.timestamp).toISOString()).not.toThrow();
  });
});
