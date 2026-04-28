import { AdminFederationController } from '../src/admin/federation/admin-federation.controller';

describe('AdminFederationController', () => {
  function controller(svc: any = {}) {
    return new AdminFederationController(svc);
  }

  it('health returns the federation contract identifiers', () => {
    expect(controller().health()).toEqual({
      ok: true,
      service: 'tgp-finance',
      identityMapping: 'email',
      surface: 'admin-federation',
    });
  });

  it('search delegates to the service with parsed limit', async () => {
    const svc = { searchUsers: jest.fn().mockResolvedValue({ query: 'x', results: [] }) };
    await controller(svc).search('alice', '50');
    expect(svc.searchUsers).toHaveBeenCalledWith('alice', 50);
  });

  it('search defaults limit to 20 when omitted or non-numeric', async () => {
    const svc = { searchUsers: jest.fn().mockResolvedValue({ query: 'x', results: [] }) };
    await controller(svc).search('alice');
    expect(svc.searchUsers).toHaveBeenLastCalledWith('alice', 20);

    await controller(svc).search('alice', 'not-a-number');
    expect(svc.searchUsers).toHaveBeenLastCalledWith('alice', 20);
  });

  it('client/coach routes URL-decode the email param', async () => {
    const svc = {
      getClientSummaryByEmail: jest.fn().mockResolvedValue({}),
      getCoachSummaryByEmail: jest.fn().mockResolvedValue({}),
    };
    await controller(svc).client('alice%2Bbeta%40example.com');
    await controller(svc).coach('coach%40example.com');
    expect(svc.getClientSummaryByEmail).toHaveBeenCalledWith('alice+beta@example.com');
    expect(svc.getCoachSummaryByEmail).toHaveBeenCalledWith('coach@example.com');
  });

  it('usage delegates straight through', async () => {
    const svc = { getProductUsage: jest.fn().mockResolvedValue({ ok: true }) };
    await controller(svc).usage();
    expect(svc.getProductUsage).toHaveBeenCalled();
  });
});
