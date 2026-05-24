/**
 * @fileoverview Tests for census_query_data tool.
 * @module tests/tools/census-query-data.tool.test
 */

import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { censusQueryData } from '@/mcp-server/tools/definitions/census-query-data.tool.js';

vi.mock('@/services/census-api/census-api-service.js', () => ({
  getCensusApiService: vi.fn(),
}));

vi.mock('@/services/variable-cache/variable-cache-service.js', () => ({
  DATASET_LATEST_YEARS: { 'acs/acs5': 2024 },
  KNOWN_DATASETS: new Set(['acs/acs5', 'acs/acs1', 'acs/acs5/profile', 'dec/pl']),
  getVariableCacheService: vi.fn(),
}));

vi.mock('@/config/server-config.js', () => ({
  getServerConfig: vi.fn(() => ({ defaultYear: 2024 })),
}));

const mockQueryData = vi.fn();
const mockGetVariablesByCode = vi.fn();

beforeEach(async () => {
  vi.clearAllMocks();

  const { getCensusApiService } = await import('@/services/census-api/census-api-service.js');
  vi.mocked(getCensusApiService).mockReturnValue({ queryData: mockQueryData } as never);

  const { getVariableCacheService } = await import(
    '@/services/variable-cache/variable-cache-service.js'
  );
  vi.mocked(getVariableCacheService).mockReturnValue({
    getVariablesByCode: mockGetVariablesByCode,
  } as never);

  // Default: label enrichment returns the code as label (best-effort)
  mockGetVariablesByCode.mockResolvedValue([]);
});

describe('censusQueryData', () => {
  it('returns enriched rows for a valid query', async () => {
    mockQueryData.mockResolvedValue([
      {
        geographyName: 'King County, Washington',
        geographyFips: '033',
        variables: {
          B19013_001E: { estimate: 105000, label: 'B19013_001E', suppressed: false },
        },
      },
    ]);

    const ctx = createMockContext({ errors: censusQueryData.errors });
    const input = censusQueryData.input.parse({
      variables: ['B19013_001E'],
      geography_level: 'county',
      geography_fips: '033',
      parent_fips: '53',
    });
    const result = await censusQueryData.handler(input, ctx);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.geography_name).toBe('King County, Washington');
    expect(result.rows[0]?.geography_fips).toBe('033');
    expect(result.total_rows).toBe(1);
    expect(result.dataset).toBe('acs/acs5');
    expect(result.year).toBe(2024);
  });

  it('passes parentFips to apiService when provided', async () => {
    mockQueryData.mockResolvedValue([
      {
        geographyName: 'King County, Washington',
        geographyFips: '033',
        variables: {
          B19013_001E: { estimate: 105000, label: 'B19013_001E', suppressed: false },
        },
      },
    ]);

    const ctx = createMockContext({ errors: censusQueryData.errors });
    const input = censusQueryData.input.parse({
      variables: ['B19013_001E'],
      geography_level: 'county',
      geography_fips: '033',
      parent_fips: '53',
    });
    await censusQueryData.handler(input, ctx);

    expect(mockQueryData).toHaveBeenCalledWith(
      expect.objectContaining({ parentFips: '53' }),
      expect.anything(),
    );
  });

  it('omits parentFips from apiService call when not provided', async () => {
    mockQueryData.mockResolvedValue([
      {
        geographyName: 'California',
        geographyFips: '06',
        variables: {
          B01001_001E: { estimate: 39000000, label: 'B01001_001E', suppressed: false },
        },
      },
    ]);

    const ctx = createMockContext({ errors: censusQueryData.errors });
    const input = censusQueryData.input.parse({
      variables: ['B01001_001E'],
      geography_level: 'state',
      geography_fips: '06',
    });
    await censusQueryData.handler(input, ctx);

    const callArgs = mockQueryData.mock.calls[0]?.[0];
    expect(callArgs).not.toHaveProperty('parentFips');
  });

  it('throws InvalidParams when variables array is empty', async () => {
    const ctx = createMockContext({ errors: censusQueryData.errors });
    // Zod allows empty array — handler validates length
    const input = { variables: [], geography_level: 'state', geography_fips: '06' };
    await expect(
      censusQueryData.handler(input as Parameters<typeof censusQueryData.handler>[0], ctx),
    ).rejects.toMatchObject({
      code: JsonRpcErrorCode.InvalidParams,
    });
  });

  it('throws too_many_variables when more than 50 requested', async () => {
    const ctx = createMockContext({ errors: censusQueryData.errors });
    const manyVars = Array.from({ length: 51 }, (_, i) => `B19013_${String(i).padStart(3, '0')}E`);
    const input = censusQueryData.input.parse({
      variables: manyVars,
      geography_level: 'state',
      geography_fips: '06',
    });
    await expect(censusQueryData.handler(input, ctx)).rejects.toMatchObject({
      data: { reason: 'too_many_variables' },
    });
  });

  it('throws geography_not_supported for unknown dataset', async () => {
    const ctx = createMockContext({ errors: censusQueryData.errors });
    const input = censusQueryData.input.parse({
      variables: ['B19013_001E'],
      geography_level: 'state',
      geography_fips: '06',
      dataset: 'invalid/dataset',
    });
    await expect(censusQueryData.handler(input, ctx)).rejects.toMatchObject({
      code: JsonRpcErrorCode.InvalidParams,
    });
  });

  it('throws no_data when query returns empty rows', async () => {
    mockQueryData.mockResolvedValue([]);

    const ctx = createMockContext({ errors: censusQueryData.errors });
    const input = censusQueryData.input.parse({
      variables: ['B19013_001E'],
      geography_level: 'county',
      geography_fips: '999',
      dataset: 'acs/acs5',
    });
    await expect(censusQueryData.handler(input, ctx)).rejects.toMatchObject({
      data: { reason: 'no_data' },
    });
  });

  it('surfaces suppressed values with suppression_reason in output', async () => {
    mockQueryData.mockResolvedValue([
      {
        geographyName: 'Small County',
        geographyFips: '999',
        variables: {
          B19013_001E: {
            estimate: null,
            label: 'B19013_001E',
            suppressed: true,
            suppressionReason: 'Not available — geography too small or data not collected',
          },
        },
      },
    ]);

    const ctx = createMockContext({ errors: censusQueryData.errors });
    const input = censusQueryData.input.parse({
      variables: ['B19013_001E'],
      geography_level: 'county',
      geography_fips: '999',
    });
    const result = await censusQueryData.handler(input, ctx);

    const vars = result.rows[0]?.variables as Record<
      string,
      { suppressed: boolean; suppression_reason?: string }
    >;
    expect(vars.B19013_001E?.suppressed).toBe(true);
    expect(vars.B19013_001E?.suppression_reason).toContain('geography too small');
  });

  it('formats output with geography names, FIPS, and variable values', () => {
    const output = {
      rows: [
        {
          geography_name: 'King County, Washington',
          geography_fips: '033',
          variables: {
            B19013_001E: {
              estimate: 105000,
              label: 'Median household income',
              suppressed: false,
            },
          },
        },
      ],
      total_rows: 1,
      dataset: 'acs/acs5',
      year: 2024,
    };
    const blocks = censusQueryData.format!(output);
    expect(blocks[0]?.type).toBe('text');
    const text = (blocks[0] as { type: string; text: string }).text;
    expect(text).toContain('King County, Washington');
    expect(text).toContain('033');
    expect(text).toContain('B19013_001E');
    expect(text).toContain('105,000');
  });

  it('format shows suppressed label when estimate is suppressed', () => {
    const output = {
      rows: [
        {
          geography_name: 'Tiny Town',
          geography_fips: '999',
          variables: {
            B19013_001E: {
              estimate: null,
              label: 'Median household income',
              suppressed: true,
              suppression_reason: 'Not available — geography too small',
            },
          },
        },
      ],
      total_rows: 1,
      dataset: 'acs/acs5',
      year: 2024,
    };
    const blocks = censusQueryData.format!(output);
    const text = (blocks[0] as { type: string; text: string }).text;
    expect(text).toContain('Suppressed');
    expect(text).toContain('geography too small');
  });
});
