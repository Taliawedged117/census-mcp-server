/**
 * @fileoverview Tests for census_search_variables tool.
 * @module tests/tools/census-search-variables.tool.test
 */

import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { censusSearchVariables } from '@/mcp-server/tools/definitions/census-search-variables.tool.js';

// Mock the variable cache service and server config
vi.mock('@/services/variable-cache/variable-cache-service.js', () => ({
  DATASET_LATEST_YEARS: { 'acs/acs5': 2024 },
  getVariableCacheService: vi.fn(),
}));

vi.mock('@/config/server-config.js', () => ({
  getServerConfig: vi.fn(() => ({ defaultYear: 2024 })),
}));

const mockSearchVariables = vi.fn();

beforeEach(async () => {
  vi.clearAllMocks();
  const { getVariableCacheService } = await import(
    '@/services/variable-cache/variable-cache-service.js'
  );
  vi.mocked(getVariableCacheService).mockReturnValue({
    searchVariables: mockSearchVariables,
  } as never);
});

describe('censusSearchVariables', () => {
  it('returns matching variables for a keyword query', async () => {
    mockSearchVariables.mockResolvedValue({
      variables: [
        {
          code: 'B19013_001E',
          label: 'Estimate!!Median household income in the past 12 months',
          concept: 'MEDIAN HOUSEHOLD INCOME IN THE PAST 12 MONTHS',
          predicateType: 'int',
          moeCode: 'B19013_001M',
        },
      ],
      totalMatches: 1,
    });

    const ctx = createMockContext();
    const input = censusSearchVariables.input.parse({ query: 'median household income' });
    const result = await censusSearchVariables.handler(input, ctx);

    expect(result.variables).toHaveLength(1);
    expect(result.variables[0]?.variable_code).toBe('B19013_001E');
    expect(result.variables[0]?.moe_code).toBe('B19013_001M');
    expect(result.total_matches).toBe(1);
    expect(result.dataset).toBe('acs/acs5');
    expect(result.year).toBe(2024);
  });

  it('uses defaults when dataset and year are omitted', async () => {
    mockSearchVariables.mockResolvedValue({ variables: [], totalMatches: 0 });

    const ctx = createMockContext();
    const input = censusSearchVariables.input.parse({ query: 'poverty' });
    const result = await censusSearchVariables.handler(input, ctx);

    expect(result.dataset).toBe('acs/acs5');
    expect(result.year).toBe(2024);
    expect(mockSearchVariables).toHaveBeenCalledWith(
      expect.objectContaining({ dataset: 'acs/acs5', year: 2024 }),
      expect.anything(),
    );
  });

  it('caps limit at 100', async () => {
    mockSearchVariables.mockResolvedValue({ variables: [], totalMatches: 0 });

    const ctx = createMockContext();
    const input = censusSearchVariables.input.parse({ query: 'income', limit: 999 });
    await censusSearchVariables.handler(input, ctx);

    expect(mockSearchVariables).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100 }),
      expect.anything(),
    );
  });

  it('returns empty variables list when no match', async () => {
    mockSearchVariables.mockResolvedValue({ variables: [], totalMatches: 0 });

    const ctx = createMockContext();
    const input = censusSearchVariables.input.parse({ query: 'xyzzy_nonexistent' });
    const result = await censusSearchVariables.handler(input, ctx);

    expect(result.variables).toHaveLength(0);
    expect(result.total_matches).toBe(0);
  });

  it('formats output with variable codes and concepts', () => {
    const output = {
      variables: [
        {
          variable_code: 'B19013_001E',
          label: 'Median household income',
          concept: 'MEDIAN HOUSEHOLD INCOME',
          predicate_type: 'int',
          moe_code: 'B19013_001M',
        },
      ],
      total_matches: 1,
      dataset: 'acs/acs5',
      year: 2024,
    };
    const blocks = censusSearchVariables.format!(output);
    expect(blocks[0]?.type).toBe('text');
    const text = (blocks[0] as { type: string; text: string }).text;
    expect(text).toContain('B19013_001E');
    expect(text).toContain('MEDIAN HOUSEHOLD INCOME');
    expect(text).toContain('B19013_001M');
  });

  it('format shows truncation hint when total_matches exceeds shown count', () => {
    const output = {
      variables: [
        {
          variable_code: 'B17001_001E',
          label: 'Total',
          concept: 'POVERTY STATUS',
          predicate_type: 'int',
        },
      ],
      total_matches: 250,
      dataset: 'acs/acs5',
      year: 2024,
    };
    const blocks = censusSearchVariables.format!(output);
    const text = (blocks[0] as { type: string; text: string }).text;
    expect(text).toContain('249 more');
  });
});
