/**
 * @fileoverview Census variable cache service. Fetches and caches variables.json per dataset+year
 * with a configurable TTL, then performs client-side keyword search across label and concept fields.
 * @module services/variable-cache/variable-cache-service
 */

import type { Context } from '@cyanheads/mcp-ts-core';
import type { AppConfig } from '@cyanheads/mcp-ts-core/config';
import { notFound, serviceUnavailable } from '@cyanheads/mcp-ts-core/errors';
import type { StorageService } from '@cyanheads/mcp-ts-core/storage';
import { fetchWithTimeout, type RequestContext, withRetry } from '@cyanheads/mcp-ts-core/utils';
import { getServerConfig } from '@/config/server-config.js';
import type { CensusVariable, RawVariablesJson } from './types.js';

const CENSUS_API_BASE = 'https://api.census.gov/data';

/** Known dataset codes for validation. */
export const KNOWN_DATASETS = new Set([
  'acs/acs5',
  'acs/acs5/profile',
  'acs/acs5/subject',
  'acs/acs1',
  'acs/acs1/profile',
  'pep/charv',
  'dec/pl',
  'dec/ddhca',
]);

/** Map of dataset to latest available year (as of implementation). */
export const DATASET_LATEST_YEARS: Record<string, number> = {
  'acs/acs5': 2024,
  'acs/acs5/profile': 2024,
  'acs/acs5/subject': 2024,
  'acs/acs1': 2024,
  'acs/acs1/profile': 2024,
  'pep/charv': 2023,
  'dec/pl': 2020,
  'dec/ddhca': 2020,
};

interface CacheEntry {
  fetchedAt: number;
  variables: Map<string, CensusVariable>;
}

export class VariableCacheService {
  private readonly cache = new Map<string, CacheEntry>();

  /**
   * Search variables by keyword across label and concept fields.
   * Returns variables sorted by relevance (exact concept match > label match > partial).
   */
  async searchVariables(
    params: { query: string; dataset: string; year: number; limit: number },
    ctx: Context,
  ): Promise<{ variables: CensusVariable[]; totalMatches: number }> {
    const variables = await this.getVariables(params.dataset, params.year, ctx);
    const queryLower = params.query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/).filter(Boolean);

    const scored: Array<{ variable: CensusVariable; score: number }> = [];

    for (const variable of variables.values()) {
      const labelLower = variable.label.toLowerCase();
      const conceptLower = variable.concept.toLowerCase();

      let score = 0;
      if (conceptLower === queryLower) score += 100;
      else if (conceptLower.includes(queryLower)) score += 50;
      if (labelLower === queryLower) score += 80;
      else if (labelLower.includes(queryLower)) score += 40;
      for (const term of queryTerms) {
        if (conceptLower.includes(term)) score += 10;
        if (labelLower.includes(term)) score += 5;
      }

      if (score > 0) scored.push({ variable, score });
    }

    scored.sort((a, b) => b.score - a.score);

    return {
      variables: scored.slice(0, params.limit).map((s) => s.variable),
      totalMatches: scored.length,
    };
  }

  /**
   * Get metadata for specific variable codes. Throws if any code is not found.
   */
  async getVariablesByCode(
    codes: string[],
    dataset: string,
    year: number,
    ctx: Context,
  ): Promise<CensusVariable[]> {
    const variables = await this.getVariables(dataset, year, ctx);
    const results: CensusVariable[] = [];
    const missing: string[] = [];

    for (const code of codes) {
      const variable = variables.get(code);
      if (variable) {
        results.push(variable);
      } else {
        missing.push(code);
      }
    }

    if (missing.length > 0) {
      throw notFound(`Variable codes not found in ${dataset} (${year}): ${missing.join(', ')}`, {
        reason: 'variable_not_found',
        missingCodes: missing,
        dataset,
        year,
        recovery: {
          hint: `Use census_search_variables to find valid codes for ${dataset} ${year}.`,
        },
      });
    }

    return results;
  }

  /** Validate that a dataset code is known. */
  validateDataset(dataset: string): void {
    if (!KNOWN_DATASETS.has(dataset)) {
      throw notFound(
        `Unknown dataset: "${dataset}". Use census_list_datasets to see valid dataset codes.`,
        {
          reason: 'dataset_not_found',
          dataset,
          recovery: {
            hint: 'Call census_list_datasets to discover valid dataset codes like acs/acs5.',
          },
        },
      );
    }
  }

  /** Get or fetch the variable map for a dataset+year. Cached in-memory with TTL. */
  private async getVariables(
    dataset: string,
    year: number,
    ctx: Context,
  ): Promise<Map<string, CensusVariable>> {
    this.validateDataset(dataset);

    const { variableCacheTtlHours } = getServerConfig();
    const ttlMs = variableCacheTtlHours * 60 * 60 * 1000;
    const cacheKey = `${dataset}|${year}`;
    const existing = this.cache.get(cacheKey);

    if (existing && Date.now() - existing.fetchedAt < ttlMs) {
      ctx.log.debug('Variable cache hit', { dataset, year });
      return existing.variables;
    }

    ctx.log.info('Fetching variables.json', { dataset, year });
    const url = `${CENSUS_API_BASE}/${year}/${dataset}/variables.json`;

    const raw = await withRetry(
      async () => {
        const response = await fetchWithTimeout(url, 30_000, ctx as unknown as RequestContext, {
          signal: ctx.signal,
        });
        const text = await response.text();

        if (/^\s*<(!DOCTYPE\s+html|html[\s>])/i.test(text)) {
          throw serviceUnavailable(
            `Census variables.json returned HTML for ${dataset} (${year}).`,
            { reason: 'variables_unavailable' },
          );
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw serviceUnavailable(
            `Census variables.json could not be parsed for ${dataset} (${year}).`,
            { reason: 'variables_unavailable' },
          );
        }

        return parsed as RawVariablesJson;
      },
      {
        operation: 'VariableCacheService.getVariables',
        context: ctx as unknown as RequestContext,
        baseDelayMs: 2000,
        signal: ctx.signal,
      },
    );

    const variables = new Map<string, CensusVariable>();
    const rawVars = raw.variables ?? {};

    for (const [code, entry] of Object.entries(rawVars)) {
      if (code === 'for' || code === 'in' || code === 'ucgid') continue;

      const moeCode = code.endsWith('E') ? `${code.slice(0, -1)}M` : undefined;
      const estimateCode = code.endsWith('M') ? `${code.slice(0, -1)}E` : undefined;

      const variable: CensusVariable = {
        code,
        label: entry.label ?? '',
        concept: entry.concept ?? '',
        predicateType: entry.predicateType ?? 'string',
      };

      if (entry.universe) variable.universe = entry.universe;
      if (estimateCode && rawVars[estimateCode]) variable.estimateCode = estimateCode;
      if (moeCode && rawVars[moeCode]) variable.moeCode = moeCode;

      variables.set(code, variable);
    }

    this.cache.set(cacheKey, { variables, fetchedAt: Date.now() });
    ctx.log.info('Variable cache populated', { dataset, year, variableCount: variables.size });
    return variables;
  }
}

// --- Init/accessor pattern ---

let _service: VariableCacheService | undefined;

export function initVariableCacheService(_config: AppConfig, _storage: StorageService): void {
  _service = new VariableCacheService();
}

export function getVariableCacheService(): VariableCacheService {
  if (!_service) {
    throw new Error(
      'VariableCacheService not initialized — call initVariableCacheService() in setup()',
    );
  }
  return _service;
}
