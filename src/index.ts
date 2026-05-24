#!/usr/bin/env node
/**
 * @fileoverview census-mcp-server MCP server entry point.
 * Registers all Census Bureau tools and initializes domain services.
 * @module index
 */

import { createApp } from '@cyanheads/mcp-ts-core';
import { allToolDefinitions } from './mcp-server/tools/definitions/index.js';
import { initCensusApiService } from './services/census-api/census-api-service.js';
import { initGeographyService } from './services/geography/geography-service.js';
import { initVariableCacheService } from './services/variable-cache/variable-cache-service.js';

await createApp({
  tools: allToolDefinitions,
  resources: [],
  prompts: [],
  instructions:
    'US Census Bureau data server. Recommended workflow:\n' +
    '1. census_list_datasets — discover available datasets and their years\n' +
    '2. census_search_variables — find variable codes from human-readable concepts\n' +
    '3. census_resolve_geography — convert place names to FIPS codes\n' +
    '4. census_query_data — retrieve estimates for one geography\n' +
    '5. census_compare_geographies — rank and compare across many geographies\n' +
    'CENSUS_API_KEY is required for all data queries (census_query_data, census_compare_geographies). ' +
    'Variable search and geography resolution work without a key.',
  setup(core) {
    initCensusApiService(core.config, core.storage);
    initVariableCacheService(core.config, core.storage);
    initGeographyService(core.config, core.storage);
  },
});
