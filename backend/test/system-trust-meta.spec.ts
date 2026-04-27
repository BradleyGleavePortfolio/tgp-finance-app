import { SystemController } from '../src/system/system.controller';

describe('SystemController.trustMeta', () => {
  let controller: SystemController;
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    controller = new SystemController();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.SUPPORT_CONTACT_EMAIL;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('reports the truthful capability set — export and deletion are concierge-handled', () => {
    const meta = controller.trustMeta();

    // Self-serve export and deletion are not implemented yet. The Trust
    // Center surface depends on these flags being honest — if either flips
    // back to true the mobile UI will resurrect a "Request data export"
    // button that has no backend pipeline behind it.
    expect(meta.dataExportSupported).toBe(false);
    expect(meta.accountDeletionSupported).toBe(false);

    expect(meta.readOnlyAccountAccess).toBe(true);
    expect(meta.dataControlsMode).toBe('concierge');
    expect(meta.encryptionLevel).toMatch(/aes/i);
    expect(meta.dataResidency).toMatch(/us/i);
    expect(typeof meta.lastSecurityUpdate).toBe('string');
  });

  it('falls back to a fixed support email when SUPPORT_CONTACT_EMAIL is unset', () => {
    const meta = controller.trustMeta();
    expect(meta.supportContactEmail).toMatch(/@/);
    expect(meta.supportContactEmail).toBe('support@thegrowthproject.courses');
  });

  it('honours SUPPORT_CONTACT_EMAIL when configured', () => {
    process.env.SUPPORT_CONTACT_EMAIL = 'concierge@example.com';
    const meta = controller.trustMeta();
    expect(meta.supportContactEmail).toBe('concierge@example.com');
  });
});
