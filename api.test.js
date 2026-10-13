import { describe, expect, test } from '@jest/globals';
import { RatesError, fetchRates } from '../src/api.js';

const okResponse = (body, init = {}) => ({
  ok: true,
  status: 200,
  json: async () => body,
  ...init,
});

describe('fetchRates', () => {
  test('returns rates on a successful response', async () => {
    const body = {
      result: 'success',
      base_code: 'USD',
      time_last_update_utc: 'Mon, 12 Oct 2026 00:00:00 +0000',
      rates: { USD: 1, EUR: 0.9 },
    };
    const result = await fetchRates(async () => okResponse(body));
    expect(result).toEqual({
      base: 'USD',
      rates: { USD: 1, EUR: 0.9 },
      updated: 'Mon, 12 Oct 2026 00:00:00 +0000',
    });
  });

  test('throws a RatesError on a non-2xx response', async () => {
    const fetchImpl = async () => okResponse({}, { ok: false, status: 503 });
    await expect(fetchRates(fetchImpl)).rejects.toThrow(/HTTP 503/);
  });

  test('throws when the API reports an error result', async () => {
    const fetchImpl = async () => okResponse({ result: 'error', 'error-type': 'quota-reached' });
    await expect(fetchRates(fetchImpl)).rejects.toThrow(/quota-reached/);
  });

  test('throws when the network request fails', async () => {
    const fetchImpl = async () => {
      throw new TypeError('Failed to fetch');
    };
    await expect(fetchRates(fetchImpl)).rejects.toBeInstanceOf(RatesError);
  });

  test('throws when the body is not valid JSON', async () => {
    const fetchImpl = async () =>
      okResponse(null, {
        json: async () => {
          throw new SyntaxError('Unexpected token');
        },
      });
    await expect(fetchRates(fetchImpl)).rejects.toThrow(/unreadable/);
  });
});
