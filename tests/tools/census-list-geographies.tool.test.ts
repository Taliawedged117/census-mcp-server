/**
 * @fileoverview Tests for census_list_geographies tool.
 * @module tests/tools/census-list-geographies.tool.test
 */

import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { censusListGeographies } from '@/mcp-server/tools/definitions/census-list-geographies.tool.js';

vi.mock('@/services/census-api/census-api-service.js', () => ({
  getCensusApiService: vi.fn(),
}));

vi.mock('@/services/variable-cache/variable-cache-service.js', () => ({
  DATASET_LATEST_YEARS: { 'acs/acs5': 2024 },
  KNOWN_DATASETS: new Set(['acs/acs5', 'acs/acs1', 'acs/acs5/profile', 'dec/pl']),
}));

vi.mock('@/config/server-config.js', () => ({
  getServerConfig: vi.fn(() => ({ defaultYear: 2024 })),
}));

const mockFetchGeographyLevels = vi.fn();

beforeEach(async () => {
  vi.clearAllMocks();
  const { getCensusApiService } = await import('@/services/census-api/census-api-service.js');
  vi.mocked(getCensusApiService).mockReturnValue({
    fetchGeographyLevels: mockFetchGeographyLevels,
  } as never);
});

describe('censusListGeographies', () => {
  it('returns geography levels for a valid dataset', async () => {
    mockFetchGeographyLevels.mockResolvedValue([
      { name: 'us', geoLevelId: '010', requires: [] },
      { name: 'state', geoLevelId: '040', requires: [] },
      { name: 'county', geoLevelId: '050', requires: ['state'] },
      { name: 'tract', geoLevelId: '140', requires: ['state', 'county'] },
    ]);

    const ctx = createMockContext({ errors: censusListGeographies.errors });
    const input = censusListGeographies.input.parse({ dataset: 'acs/acs5' });
    const result = await censusListGeographies.handler(input, ctx);

    expect(result.geography_levels).toHaveLength(4);
    expect(result.dataset).toBe('acs/acs5');
    expect(result.year).toBe(2024);

    const county = result.geography_levels.find((g) => g.geography_level === 'county');
    expect(county?.requires_parent).toBe(true);
    expect(county?.required_parent_levels).toContain('state');

    const state = result.geography_levels.find((g) => g.geography_level === 'state');
    expect(state?.requires_parent).toBe(false);
  });

  it('throws dataset_not_found for unknown dataset', async () => {
    const ctx = createMockContext({ errors: censusListGeographies.errors });
    const input = censusListGeographies.input.parse({ dataset: 'invalid/dataset' });
    await expect(censusListGeographies.handler(input, ctx)).rejects.toMatchObject({
      code: JsonRpcErrorCode.NotFound,
      data: { reason: 'dataset_not_found' },
    });
  });

  it('throws year_not_available when API returns empty levels', async () => {
    mockFetchGeographyLevels.mockResolvedValue([]);

    const ctx = createMockContext({ errors: censusListGeographies.errors });
    const input = censusListGeographies.input.parse({ dataset: 'acs/acs5', year: 1900 });
    await expect(censusListGeographies.handler(input, ctx)).rejects.toMatchObject({
      code: JsonRpcErrorCode.InvalidParams,
      data: { reason: 'year_not_available' },
    });
  });

  it('assigns example FIPS values for known level names', async () => {
    mockFetchGeographyLevels.mockResolvedValue([
      { name: 'state', geoLevelId: '040', requires: [] },
      { name: 'county', geoLevelId: '050', requires: ['state'] },
      { name: 'zip code tabulation area', geoLevelId: '860', requires: [] },
    ]);

    const ctx = createMockContext({ errors: censusListGeographies.errors });
    const input = censusListGeographies.input.parse({ dataset: 'acs/acs5' });
    const result = await censusListGeographies.handler(input, ctx);

    const state = result.geography_levels.find((g) => g.geography_level === 'state');
    expect(state?.example).toContain('06');

    const zcta = result.geography_levels.find(
      (g) => g.geography_level === 'zip code tabulation area',
    );
    expect(zcta?.example).toContain('90001');
  });

  it('formats output listing geography levels', () => {
    const output = {
      geography_levels: [
        {
          geography_level: 'state',
          requires_parent: false,
          required_parent_levels: [],
          example: '06 (California)',
        },
        {
          geography_level: 'county',
          requires_parent: true,
          required_parent_levels: ['state'],
          example: '037 (Los Angeles County)',
        },
      ],
      dataset: 'acs/acs5',
      year: 2024,
    };
    const blocks = censusListGeographies.format!(output);
    expect(blocks[0]?.type).toBe('text');
    const text = (blocks[0] as { type: string; text: string }).text;
    expect(text).toContain('state');
    expect(text).toContain('county');
    expect(text).toContain('06 (California)');
    expect(text).toContain('037 (Los Angeles County)');
  });
});
