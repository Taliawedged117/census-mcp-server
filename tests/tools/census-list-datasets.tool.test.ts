/**
 * @fileoverview Tests for census_list_datasets tool.
 * @module tests/tools/census-list-datasets.tool.test
 */

import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { describe, expect, it } from 'vitest';
import { censusListDatasets } from '@/mcp-server/tools/definitions/census-list-datasets.tool.js';

describe('censusListDatasets', () => {
  it('returns all datasets when no filter provided', () => {
    const ctx = createMockContext();
    const input = censusListDatasets.input.parse({});
    const result = censusListDatasets.handler(input, ctx);
    expect(result.datasets.length).toBeGreaterThan(0);
    expect(result.total_count).toBe(result.datasets.length);
    expect(result.datasets[0]).toHaveProperty('dataset_id');
    expect(result.datasets[0]).toHaveProperty('name');
    expect(result.datasets[0]).toHaveProperty('description');
    expect(result.datasets[0]).toHaveProperty('available_years');
  });

  it('includes acs/acs5 in the unfiltered list', () => {
    const ctx = createMockContext();
    const input = censusListDatasets.input.parse({});
    const result = censusListDatasets.handler(input, ctx);
    const acs5 = result.datasets.find((d) => d.dataset_id === 'acs/acs5');
    expect(acs5).toBeDefined();
    expect(acs5?.available_years.length).toBeGreaterThan(0);
  });

  it('filters by keyword matching name or description', () => {
    const ctx = createMockContext();
    const input = censusListDatasets.input.parse({ filter: 'Decennial' });
    const result = censusListDatasets.handler(input, ctx);
    expect(result.total_count).toBeGreaterThan(0);
    // Filter matches name OR description — at least one field should contain 'decennial'
    const filterLower = 'decennial';
    expect(
      result.datasets.every(
        (d) =>
          d.name.toLowerCase().includes(filterLower) ||
          d.description.toLowerCase().includes(filterLower) ||
          d.dataset_id.toLowerCase().includes(filterLower),
      ),
    ).toBe(true);
  });

  it('filters by dataset_id substring', () => {
    const ctx = createMockContext();
    const input = censusListDatasets.input.parse({ filter: 'acs1' });
    const result = censusListDatasets.handler(input, ctx);
    expect(result.total_count).toBeGreaterThan(0);
    expect(result.datasets.every((d) => d.dataset_id.includes('acs1'))).toBe(true);
  });

  it('returns empty list for non-matching filter', () => {
    const ctx = createMockContext();
    const input = censusListDatasets.input.parse({ filter: 'NONEXISTENT_DATASET_XYZ' });
    const result = censusListDatasets.handler(input, ctx);
    expect(result.total_count).toBe(0);
    expect(result.datasets).toHaveLength(0);
  });

  it('formats output with dataset IDs and names', () => {
    const output = {
      datasets: [
        {
          dataset_id: 'acs/acs5',
          name: 'American Community Survey 5-Year Estimates',
          description: 'ACS 5-year estimates.',
          available_years: [2022, 2023, 2024],
        },
      ],
      total_count: 1,
    };
    const blocks = censusListDatasets.format!(output);
    expect(blocks[0]?.type).toBe('text');
    const text = (blocks[0] as { type: string; text: string }).text;
    expect(text).toContain('acs/acs5');
    expect(text).toContain('American Community Survey');
    expect(text).toContain('2024');
  });
});
