/**
 * Fixed worker configuration. Deliberately hardcoded rather than exposed via
 * a .env file — the user explicitly asked for zero extra configuration
 * beyond `docker compose up`/`down`. DATA_DIR keeps an optional env override
 * only because it's convenient for running the worker outside Docker during
 * development; it's never required.
 */

/** One work item per tick. ~960 requests/day — gentle on a shared public instance. */
export const TICK_INTERVAL_MS = 90_000

export const DATA_DIR = process.env.AREA_DB_DATA_DIR ?? '/data/area-db'

export const HTTP_PORT = 8081

/** Gets full admin_level 2-6 coverage first, ahead of the rest of Europe. */
export const HOME_COUNTRY_ISO2 = 'DE'
