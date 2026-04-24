// Default Jest mock for expo-server-sdk. The real package ships ESM-only
// code that ts-jest can't parse in our test environment. Tests that need
// to assert on push behaviour can override this via jest.mock(...) with a
// richer inline factory (see push-sender.service.spec.ts).

export class Expo {
  static isExpoPushToken(token: unknown): boolean {
    return typeof token === 'string' && /^Exp(onent)?PushToken\[/.test(token);
  }
  chunkPushNotifications(msgs: unknown[]): unknown[][] {
    return msgs.length ? [msgs] : [];
  }
  chunkPushNotificationReceiptIds(ids: unknown[]): unknown[][] {
    return ids.length ? [ids] : [];
  }
  async sendPushNotificationsAsync(): Promise<unknown[]> {
    return [];
  }
  async getPushNotificationReceiptsAsync(): Promise<Record<string, unknown>> {
    return {};
  }
}

export type ExpoPushMessage = unknown;
export type ExpoPushTicket = unknown;
export type ExpoPushReceiptId = string;
export type ExpoPushReceipt = unknown;
