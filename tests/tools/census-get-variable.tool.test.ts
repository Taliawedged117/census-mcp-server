/**
 * @fileoverview Tests for census_get_variable tool.
 * @module tests/tools/census-get-variable.tool.test
 */

import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { censusGetVariable } from '@/mcp-server/tools/definitions/census-get-variable.tool.js';

vi.mock('@/services/variable-cache/variable-cache-service.js', () => ({
  DATASET_LATEST_YEARS: { 'acs/acs5': 2024 },
  getVariableCacheService: vi.fn(),
}));

vi.mock('@/config/server-config.js', () => ({
  getServerConfig: vi.fn(() => ({ defaultYear: 2024 })),
}));

const mockGetVariablesByCode = vi.fn();

beforeEach(async () => {
  vi.clearAllMocks();
  const { getVariableCacheService } = await import(
    '@/services/variable-cache/variable-cache-service.js'
  );
  vi.mocked(getVariableCacheService).mockReturnValue({
    getVariablesByCode: mockGetVariablesByCode,
  } as never);
});

describe('censusGetVariable', () => {
  it('returns full metadata for a valid variable code', async () => {
    mockGetVariablesByCode.mockResolvedValue([
      {
        code: 'B19013_001E',
        label: 'Estimate!!Median household income in the past 12 months',
        concept: 'MEDIAN HOUSEHOLD INCOME IN THE PAST 12 MONTHS',
        predicateType: 'int',
        universe: 'Households',
        moeCode: 'B19013_001M',
      },
    ]);

    const ctx = createMockContext();
    const input = censusGetVariable.input.parse({ variables: ['B19013_001E'] });
    const result = await censusGetVariable.handler(input, ctx);

    expect(result.variables).toHaveLength(1);
    expect(result.variables[0]?.variable_code).toBe('B19013_001E');
    expect(result.variables[0]?.label).toContain('Median household income');
    expect(result.variables[0]?.universe).toBe('Households');
    expect(result.variables[0]?.moe_code).toBe('B19013_001M');
    expect(result.dataset).toBe('acs/acs5');
    expect(result.year).toBe(2024);
  });

  it('returns metadata for multiple variables', async () => {
    mockGetVariablesByCode.mockResolvedValue([
      {
        code: 'B19013_001E',
        label: 'Estimate!!Median household income',
        concept: 'MEDIAN HOUSEHOLD INCOME',
        predicateType: 'int',
        moeCode: 'B19013_001M',
      },
      {
        code: 'B19013_001M',
        label: 'Margin of Error!!Median household income',
        concept: 'MEDIAN HOUSEHOLD INCOME',
        predicateType: 'int',
        estimateCode: 'B19013_001E',
      },
    ]);

    const ctx = createMockContext();
    const input = censusGetVariable.input.parse({
      variables: ['B19013_001E', 'B19013_001M'],
    });
    const result = await censusGetVariable.handler(input, ctx);

    expect(result.variables).toHaveLength(2);
    expect(result.variables[1]?.estimate_code).toBe('B19013_001E');
  });

  it('throws when variable code is not found', async () => {
    const { notFound } = await import('@cyanheads/mcp-ts-core/errors');
    mockGetVariablesByCode.mockRejectedValue(
      notFound('Variable codes not found in acs/acs5 (2024): INVALID_CODE', {
        reason: 'variable_not_found',
      }),
    );

    const ctx = createMockContext({ errors: censusGetVariable.errors });
    const input = censusGetVariable.input.parse({ variables: ['INVALID_CODE'] });
    await expect(censusGetVariable.handler(input, ctx)).rejects.toMatchObject({
      code: JsonRpcErrorCode.NotFound,
    });
  });

  it('omits optional fields when not present in upstream variable', async () => {
    mockGetVariablesByCode.mockResolvedValue([
      {
        code: 'NAME',
        label: 'Geographic Area Name',
        concept: '',
        predicateType: 'string',
        // no universe, estimateCode, or moeCode
      },
    ]);

    const ctx = createMockContext();
    const input = censusGetVariable.input.parse({ variables: ['NAME'] });
    const result = await censusGetVariable.handler(input, ctx);

    expect(result.variables[0]).not.toHaveProperty('universe');
    expect(result.variables[0]).not.toHaveProperty('moe_code');
    expect(result.variables[0]).not.toHaveProperty('estimate_code');
  });

  it('formats output with variable codes and labels', () => {
    const output = {
      variables: [
        {
          variable_code: 'B19013_001E',
          label: 'Estimate!!Median household income',
          concept: 'MEDIAN HOUSEHOLD INCOME',
          predicate_type: 'int',
          universe: 'Households',
          moe_code: 'B19013_001M',
        },
      ],
      dataset: 'acs/acs5',
      year: 2024,
    };
    const blocks = censusGetVariable.format!(output);
    expect(blocks[0]?.type).toBe('text');
    const text = (blocks[0] as { type: string; text: string }).text;
    expect(text).toContain('B19013_001E');
    expect(text).toContain('MEDIAN HOUSEHOLD INCOME');
    expect(text).toContain('Households');
    expect(text).toContain('B19013_001M');
  });
});
