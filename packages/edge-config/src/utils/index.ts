import type { Connection } from '../types';

export const ERRORS = {
  UNEXPECTED: '@vercel/edge-config: Unexpected error',
  UNAUTHORIZED: '@vercel/edge-config: Unauthorized',
  NETWORK: '@vercel/edge-config: Network error',
  EDGE_CONFIG_NOT_FOUND: '@vercel/edge-config: Edge Config not found',
};

/**
 * Checks if an object has a property
 */
export function hasOwnProperty<X, Y extends PropertyKey>(
  obj: X,
  prop: Y,
): obj is X & Record<Y, unknown> {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

export function pick<T, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const ret: Partial<T> = {};
  keys.forEach((key) => {
    ret[key] = obj[key];
  });
  return ret as Pick<T, K>;
}

export function assertIsKey(key: unknown): asserts key is string {
  if (typeof key !== 'string') {
    throw new Error('@vercel/edge-config: Expected key to be a string');
  }
}

export function assertIsKeys(keys: unknown): asserts keys is string[] {
  if (!Array.isArray(keys) || keys.some((key) => typeof key !== 'string')) {
    throw new Error(
      '@vercel/edge-config: Expected keys to be an array of string',
    );
  }
}

/**
 * Creates a deep clone of an object.
 */
export function clone<T>(value: T): T {
  // only available since node v17.0.0
  if (typeof structuredClone === 'function') return structuredClone<T>(value);

  // poor man's polyfill for structuredClone
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Parses internal edge config connection strings
 *
 * Internal edge config connection strings are those which are native to Vercel.
 *
 * Internal Edge Config Connection Strings look like this:
 * https://edge-config.vercel.com/<edgeConfigId>?token=<token>
 */
function parseVercelConnectionString(text: string): Connection | null {
  try {
    const url = new URL(text);
    if (url.host !== 'edge-config.vercel.com') return null;
    if (url.protocol !== 'https:') return null;
    if (!url.pathname.startsWith('/ecfg')) return null;

    const id = url.pathname.split('/')[1];
    if (!id) return null;

    const token = url.searchParams.get('token');
    if (!token || token === '') return null;

    return {
      type: 'vercel',
      baseUrl: `https://edge-config.vercel.com/${id}`,
      id,
      version: '1',
      token,
    };
  } catch {
    return null;
  }
}

/**
 * Parses info contained in connection strings.
 *
 * This works with the vercel-provided connection strings, but it also
 * works with custom connection strings.
 *
 * The reason we support custom connection strings is that it makes testing
 * edge config really straightforward. Users can provide  connection strings
 * pointing to their own servers and then either have a custom server
 * return the desired values or even intercept requests with something like
 * msw.
 *
 * To allow interception we need a custom connection string as the
 * edge-config.vercel.com connection string might not always go over
 * the network, so msw would not have a chance to intercept.
 */
/**
 * Parses external edge config connection strings
 *
 * External edge config connection strings are those which are foreign to Vercel.
 *
 * External Edge Config Connection Strings look like this:
 * - https://example.com/?id=<edgeConfigId>&token=<token>
 * - https://example.com/<edgeConfigId>?token=<token>
 */
function parseExternalConnectionString(
  connectionString: string,
): Connection | null {
  try {
    const url = new URL(connectionString);

    let id: string | null = url.searchParams.get('id');
    const token = url.searchParams.get('token');
    const version = url.searchParams.get('version') || '1';

    // try to determine id based on pathname if it wasn't provided explicitly
    if (!id || url.pathname.startsWith('/ecfg_')) {
      id = url.pathname.split('/')[1] || null;
    }

    if (!id || !token) return null;

    // remove all search params for use as baseURL
    url.search = '';

    // try to parse as external connection string
    return {
      type: 'external',
      baseUrl: url.toString(),
      id,
      token,
      version,
    };
  } catch {
    return null;
  }
}

/**
 * Parse the edgeConfigId and token from an Edge Config Connection String.
 *
 * Edge Config Connection Strings usually look like this:
 * https://edge-config.vercel.com/<edgeConfigId>?token=<token>
 *
 * @param text - A potential Edge Config Connection String
 * @returns The connection parsed from the given Connection String or null.
 */
export function parseConnectionString(
  connectionString: string,
): Connection | null {
  const connection = parseVercelConnectionString(connectionString);
  if (connection) return connection;
  return parseExternalConnectionString(connectionString);
}

/**
 * Works around an issue in Next.js.
 *
 * Next.js problematically expects to be able to throw DynamicServerError and
 * for it to be passed all the way upwards, but we are catching all errors and
 * mapping them to a generic NetworkError.
 *
 * We do this catch-all to prevent leaky abstractions.
 * Otherwise we might leak our implementation details through errors.
 *
 * But this breaks Next.js. So we need to make an exception for it until Next.js
 * no longer expects this behavior.
 *
 * Without this fix, Next.js would fail builds of in which edge config is read
 * from async page components.
 *
 * https://github.com/vercel/storage/issues/119
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- [@vercel/style-guide@5 migration]
export const isDynamicServerError = (error: any): boolean =>
  error instanceof Error &&
  hasOwnProperty(error, 'digest') &&
  error.digest === 'DYNAMIC_SERVER_USAGE';
