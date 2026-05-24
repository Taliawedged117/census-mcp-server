/**
 * @fileoverview Tool to resolve place names and addresses to Census FIPS identifiers.
 * @module mcp-server/tools/definitions/census-resolve-geography
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { getGeographyService } from '@/services/geography/geography-service.js';

export const censusResolveGeography = tool('census_resolve_geography', {
  title: 'Resolve Census Geography',
  description:
    'Resolve a place name to Census FIPS identifiers (state, county, tract codes). Converts "King County, WA" or "Seattle, WA" to the FIPS codes required by census_query_data and census_compare_geographies. Also accepts street addresses for tract-level resolution. Returns the FIPS values directly ready to pass to other tools — state_fips as parent_fips, fips_summary as geography_fips. Always call this first when working with place names rather than raw FIPS codes.',
  annotations: { readOnlyHint: true, openWorldHint: false },
  input: z.object({
    name: z
      .string()
      .describe(
        'Place name (e.g., "King County, WA", "Seattle, WA", "California") or street address (e.g., "1600 Pennsylvania Ave NW, Washington, DC 20500"). Include the state abbreviation to disambiguate places with common names.',
      ),
    geography_type: z
      .string()
      .optional()
      .describe(
        'Expected geography type to resolve to: "state", "county", "place", or "tract". Optional — auto-detected from the name when omitted (county if "County"/"Borough"/"Parish" appears, state for two-letter abbreviations).',
      ),
  }),
  output: z.object({
    name: z.string().describe('Canonical name of the resolved geography.'),
    geography_type: z
      .string()
      .describe('Resolved geography type (state, county, place, or tract).'),
    state_fips: z
      .string()
      .describe(
        '2-digit state FIPS code. Use as parent_fips in census_query_data for sub-state queries.',
      ),
    county_fips: z
      .string()
      .optional()
      .describe(
        '3-digit county FIPS code when the resolved geography is a county or sub-county level.',
      ),
    tract_fips: z
      .string()
      .optional()
      .describe('6-digit census tract FIPS code when resolved from a street address.'),
    place_fips: z
      .string()
      .optional()
      .describe('Place FIPS code when the resolved geography is an incorporated place.'),
    fips_summary: z
      .string()
      .describe(
        'Pre-formatted FIPS value ready to use as geography_fips in census_query_data (e.g., "033" for King County with state_fips "53" as parent_fips).',
      ),
  }),

  errors: [
    {
      reason: 'no_match',
      code: JsonRpcErrorCode.NotFound,
      when: 'Place name not found in TIGERweb or geocoder returned no matches.',
      recovery:
        'Include the state abbreviation (e.g., "King County, WA"), use a full address, or verify the spelling.',
    },
    {
      reason: 'ambiguous_name',
      code: JsonRpcErrorCode.InvalidParams,
      when: 'Name matched multiple geographies across different states.',
      recovery:
        'Re-call with a more specific name that includes the state abbreviation or full state name.',
    },
    {
      reason: 'resolution_unavailable',
      code: JsonRpcErrorCode.ServiceUnavailable,
      when: 'TIGERweb or Census Geocoder endpoint was unreachable.',
      retryable: true,
      recovery:
        'Retry the request — TIGERweb and the geocoder are free-tier endpoints with no auth requirements.',
    },
  ],

  async handler(input, ctx) {
    ctx.log.info('Resolving geography', { name: input.name, geographyType: input.geography_type });

    const service = getGeographyService();
    const resolved = await service.resolveGeography(
      input.name,
      input.geography_type?.trim() || undefined,
      ctx,
    );

    return {
      name: resolved.name,
      geography_type: resolved.geographyType,
      state_fips: resolved.stateFips,
      ...(resolved.countyFips && { county_fips: resolved.countyFips }),
      ...(resolved.tractFips && { tract_fips: resolved.tractFips }),
      ...(resolved.placeFips && { place_fips: resolved.placeFips }),
      fips_summary: resolved.fipsSummary,
    };
  },

  format: (result) => {
    const lines: string[] = [
      `## Resolved: ${result.name}`,
      `**Type:** ${result.geography_type}`,
      `**State FIPS:** \`${result.state_fips}\` — use as \`parent_fips\` in census_query_data`,
      `**Geography FIPS:** \`${result.fips_summary}\` — use as \`geography_fips\` in census_query_data`,
    ];

    if (result.county_fips) lines.push(`**County FIPS:** \`${result.county_fips}\``);
    if (result.tract_fips) lines.push(`**Tract FIPS:** \`${result.tract_fips}\``);
    if (result.place_fips) lines.push(`**Place FIPS:** \`${result.place_fips}\``);

    return [{ type: 'text', text: lines.join('\n') }];
  },
});
