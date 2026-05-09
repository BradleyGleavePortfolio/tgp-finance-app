// Sprint A audit fix CR-6 — fitness federation client tests.
//
// Pins the outcome matrix:
//   not_configured -> { kind: 'skipped' }
//   no auth token  -> { kind: 'degraded', reason: 'no_auth_token' }
//   200 OK         -> { kind: 'ok' }
//   404            -> { kind: 'not_found' }
//   401/403        -> { kind: 'degraded', reason: 'auth_rejected' }
//   5xx / network  -> { kind: 'degraded', reason: ... }

import axios from 'axios';
import {
  setFitnessCoachPractice,
  __setFitnessApiUrlForTests,
} from '../fitnessApi';
import { secureStorage } from '../../lib/secureStorage';

jest.mock('axios');
jest.mock('../../lib/secureStorage', () => ({
  secureStorage: { getItem: jest.fn() },
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedSecure = secureStorage as jest.Mocked<typeof secureStorage>;

describe('setFitnessCoachPractice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __setFitnessApiUrlForTests('https://fitness.test');
    mockedSecure.getItem.mockResolvedValue('jwt-abc');
  });

  it('returns ok on 200', async () => {
    mockedAxios.put.mockResolvedValueOnce({ status: 200, data: {} });
    const result = await setFitnessCoachPractice('both');
    expect(result).toEqual({ kind: 'ok' });
    // ?propagate=false to break the federation loop
    const args = mockedAxios.put.mock.calls[0];
    expect(args[2]?.params).toEqual({ propagate: 'false' });
    expect(args[2]?.headers?.Authorization).toBe('Bearer jwt-abc');
  });

  it('returns not_found on 404 (coach has not registered fitness yet)', async () => {
    const err = Object.assign(new Error('not found'), {
      response: { status: 404 },
    });
    mockedAxios.put.mockRejectedValueOnce(err);
    const result = await setFitnessCoachPractice('finance_only');
    expect(result).toEqual({ kind: 'not_found' });
  });

  it('returns degraded auth_rejected on 401', async () => {
    const err = Object.assign(new Error('unauth'), { response: { status: 401 } });
    mockedAxios.put.mockRejectedValueOnce(err);
    const result = await setFitnessCoachPractice('both');
    expect(result).toEqual({ kind: 'degraded', reason: 'auth_rejected' });
  });

  it('returns degraded auth_rejected on 403', async () => {
    const err = Object.assign(new Error('forbid'), { response: { status: 403 } });
    mockedAxios.put.mockRejectedValueOnce(err);
    const result = await setFitnessCoachPractice('both');
    expect(result).toEqual({ kind: 'degraded', reason: 'auth_rejected' });
  });

  it('returns degraded server_error on 503', async () => {
    const err = Object.assign(new Error('5xx'), { response: { status: 503 } });
    mockedAxios.put.mockRejectedValueOnce(err);
    const result = await setFitnessCoachPractice('both');
    expect(result).toEqual({ kind: 'degraded', reason: 'server_error' });
  });

  it('returns degraded network_error on a thrown axios error with no response', async () => {
    mockedAxios.put.mockRejectedValueOnce(new Error('network down'));
    const result = await setFitnessCoachPractice('both');
    expect(result).toEqual({ kind: 'degraded', reason: 'network_error' });
  });

  it('returns skipped when fitness URL is not configured', async () => {
    __setFitnessApiUrlForTests(undefined);
    const result = await setFitnessCoachPractice('both');
    expect(result).toEqual({ kind: 'skipped', reason: 'not_configured' });
    expect(mockedAxios.put).not.toHaveBeenCalled();
  });

  it('returns degraded no_auth_token when secureStorage has no token', async () => {
    mockedSecure.getItem.mockResolvedValueOnce(null);
    const result = await setFitnessCoachPractice('both');
    expect(result).toEqual({ kind: 'degraded', reason: 'no_auth_token' });
    expect(mockedAxios.put).not.toHaveBeenCalled();
  });
});
