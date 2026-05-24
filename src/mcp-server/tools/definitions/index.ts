/**
 * @fileoverview Barrel export for all census-mcp-server tool definitions.
 * @module mcp-server/tools/definitions/index
 */

export { censusCompareGeographies } from './census-compare-geographies.tool.js';
export { censusGetVariable } from './census-get-variable.tool.js';
export { censusListDatasets } from './census-list-datasets.tool.js';
export { censusListGeographies } from './census-list-geographies.tool.js';
export { censusQueryData } from './census-query-data.tool.js';
export { censusResolveGeography } from './census-resolve-geography.tool.js';
export { censusSearchVariables } from './census-search-variables.tool.js';

import { censusCompareGeographies } from './census-compare-geographies.tool.js';
import { censusGetVariable } from './census-get-variable.tool.js';
import { censusListDatasets } from './census-list-datasets.tool.js';
import { censusListGeographies } from './census-list-geographies.tool.js';
import { censusQueryData } from './census-query-data.tool.js';
import { censusResolveGeography } from './census-resolve-geography.tool.js';
import { censusSearchVariables } from './census-search-variables.tool.js';

export const allToolDefinitions = [
  censusListDatasets,
  censusListGeographies,
  censusSearchVariables,
  censusGetVariable,
  censusResolveGeography,
  censusQueryData,
  censusCompareGeographies,
];
