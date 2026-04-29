import { UsersController } from '../src/users/users.controller';
import { UsersService } from '../src/users/users.service';
import { CurrentUser } from '../src/common/decorators/current-user.decorator';

describe('UsersController — data controls + access status', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  describe('dataControlsContact', () => {
    it('returns concierge mode and the configured support email — never a "request scheduled" success payload', async () => {
      delete process.env.SUPPORT_CONTACT_EMAIL;
      const controller = new UsersController({} as UsersService, {} as any);

      const res = await controller.dataControlsContact({ id: 'user-1' } as CurrentUser);

      expect(res.mode).toBe('concierge');
      expect(res.supportContactEmail).toMatch(/@/);
      expect(res.acknowledgedFor).toBe('user-1');

      // Regression: the previous stub returned `{ requested: true, eta: 'within 24h' }`
      // which the mobile client surfaced as a success even though there was
      // no background job behind it. Make sure the field is gone.
      expect((res as any).requested).toBeUndefined();
      expect((res as any).eta).toBeUndefined();
    });

    it('honours SUPPORT_CONTACT_EMAIL', async () => {
      process.env.SUPPORT_CONTACT_EMAIL = 'concierge@example.com';
      const controller = new UsersController({} as UsersService, {} as any);
      const res = await controller.dataControlsContact({ id: 'user-1' } as CurrentUser);
      expect(res.supportContactEmail).toBe('concierge@example.com');
    });

    it('does not expose a delete handler that responds with `{ scheduled: true }`', () => {
      const controller = new UsersController({} as UsersService, {} as any);
      // The legacy DELETE /users/me/account stub returned a fake "scheduled"
      // payload. Confirm the method has been removed from the controller
      // surface entirely, not just renamed.
      expect((controller as any).deleteAccount).toBeUndefined();
      expect((controller as any).requestDataExport).toBeUndefined();
    });
  });

  describe('getAccessStatus delegation', () => {
    it('delegates to UsersService.getAccessStatus with the caller id', async () => {
      const usersService = {
        getAccessStatus: jest.fn().mockResolvedValue({
          role: 'student',
          accessSource: 'coach_managed',
          coach: { id: 'coach-1', displayName: 'A. Coach' },
          supportContactEmail: 'support@thegrowthproject.courses',
        }),
      } as unknown as UsersService;
      const controller = new UsersController(usersService, {} as any);

      const res = await controller.getAccessStatus({ id: 'user-1' } as CurrentUser);

      expect(usersService.getAccessStatus).toHaveBeenCalledWith('user-1');
      expect(res.accessSource).toBe('coach_managed');
      expect(res.coach?.displayName).toBe('A. Coach');
    });
  });
});
