/**
 * @fileoverview Server-specific configuration for census-mcp-server.
 * Parses Census Bureau API env vars with Zod validation.
 * @module config/server-config
 */

import { z } from '@cyanheads/mcp-ts-core';
import { parseEnvConfig } from '@cyanheads/mcp-ts-core/config';

const ServerConfigSchema = z.object({
  censusApiKey: z
    .string()
    .describe('Census Bureau API key from api.census.gov/data/key_signup.html'),
  defaultYear: z.coerce.number().default(2024).describe('Default vintage year for queries'),
  variableCacheTtlHours: z.coerce
    .number()
    .default(24)
    .describe('Hours to cache variables.json per dataset+year'),
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

let _config: ServerConfig | undefined;

export function getServerConfig(): ServerConfig {
  _config ??= parseEnvConfig(ServerConfigSchema, {
    censusApiKey: 'CENSUS_API_KEY',
    defaultYear: 'CENSUS_DEFAULT_YEAR',
    variableCacheTtlHours: 'CENSUS_VARIABLE_CACHE_TTL_HOURS',
  });
  return _config;
}
