/**
 * What the app does when the backend has not caught up.
 *
 * A release APK can easily be newer than the deployment it talks to — as it is
 * right now: `GET /config` returns 404 on the live server. That must be a
 * non-event. The onboarding screen still needs a condition list, the goal
 * calculator still needs its constants, and neither may wait on the network to
 * get them.
 */

const mockStore: Record<string, string> = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: (k: string) => Promise.resolve(mockStore[k] ?? null),
    setItem: (k: string, v: string) => {
      mockStore[k] = v;
      return Promise.resolve();
    },
    removeItem: (k: string) => {
      delete mockStore[k];
      return Promise.resolve();
    },
  },
}));

jest.mock('react-native', () => ({ NativeModules: {}, Platform: { OS: 'android' } }), {
  virtual: true,
});

jest.mock(
  '../app.json',
  () => ({ aquaSageBackendUrl: 'https://backend.example', aquaSageApiKey: 'k' }),
  { virtual: true }
);

import AppConfigStore from '../src/config/appConfigStore';
import { DEFAULT_APP_CONFIG } from '../src/config/appConfigSchema';
import { refresh } from '../src/services/ConfigService';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  AppConfigStore.reset();
  for (const key of Object.keys(mockStore)) delete mockStore[key];
});

const respondWith = (status: number, body: unknown) => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }) as any;
};

describe('a backend that does not serve /config yet', () => {
  it('leaves the app on its shipped defaults instead of throwing', async () => {
    respondWith(404, { detail: 'Not Found' });

    const config = await refresh({ force: true });

    expect(config.medicalConditions.map(c => c.id)).toEqual(
      DEFAULT_APP_CONFIG.medicalConditions.map(c => c.id)
    );
    // The onboarding screen still has something to render.
    expect(AppConfigStore.enabledConditions().length).toBeGreaterThan(0);
  });

  it('survives the request failing outright', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network request failed')) as any;

    await expect(refresh({ force: true })).resolves.toBeDefined();
    expect(AppConfigStore.current().targetFormula.mlPerKg).toBe(35);
  });

  it('ignores a malformed document rather than adopting it', async () => {
    respondWith(200, { medicalConditions: [{ title: 'No id here' }] });

    await refresh({ force: true });

    // The bad list was rejected wholesale; the shipped one still stands.
    expect(AppConfigStore.current().medicalConditions.map(c => c.id)).toEqual(
      DEFAULT_APP_CONFIG.medicalConditions.map(c => c.id)
    );
  });

  it('adopts a good document and caches it for the next cold start', async () => {
    respondWith(200, {
      ...DEFAULT_APP_CONFIG,
      version: 7,
      medicalConditions: [
        { ...DEFAULT_APP_CONFIG.medicalConditions[0], targetAdjustmentMl: 999 },
      ],
    });

    await refresh({ force: true });

    expect(AppConfigStore.current().medicalConditions[0].targetAdjustmentMl).toBe(999);
    expect(Object.keys(mockStore)).toContain('@getvari/app_config_v1');
  });
});
