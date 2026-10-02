/**
 * Which commit a deployed function was built from.
 *
 * Committed as 'dev'. `scripts/deploy-functions.sh` writes the commit here
 * for the length of a deploy and restores it afterwards, so a live function
 * answering 'dev' was deployed some other way — which is itself worth knowing.
 *
 * Every function sends it as `x-vimetry-version`, on the CORS preflight too,
 * so the daily health check can read each function's version without signing
 * in. Before this existed nobody could say whether a deploy had happened:
 * `device-sync` was owed for weeks with no way to check.
 */
export const VERSION = 'dev'
