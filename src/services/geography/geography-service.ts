/**
 * @fileoverview Geography resolution service. Converts place names and addresses to
 * Census FIPS codes using TIGERweb MapServer REST API and Census Geocoder.
 * @module services/geography/geography-service
 */

import type { Context } from '@cyanheads/mcp-ts-core';
import type { AppConfig } from '@cyanheads/mcp-ts-core/config';
import { notFound, serviceUnavailable } from '@cyanheads/mcp-ts-core/errors';
import type { StorageService } from '@cyanheads/mcp-ts-core/storage';
import { fetchWithTimeout, type RequestContext, withRetry } from '@cyanheads/mcp-ts-core/utils';
import type { GeocoderResult, ResolvedGeography, TigerwebResponse } from './types.js';

const TIGERWEB_BASE = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb';
const GEOCODER_BASE = 'https://geocoding.geo.census.gov/geocoder/geographies/address';

/** TIGERweb layer config per geography type. */
const TIGERWEB_LAYERS: Record<string, { service: string; layer: number }> = {
  state: { service: 'State_County', layer: 0 },
  county: { service: 'State_County', layer: 1 },
  place: { service: 'Places_CouSub', layer: 0 },
  tract: { service: 'Tracts_Blocks', layer: 0 },
};

export class GeographyService {
  /**
   * Resolve a place name or address to Census FIPS identifiers.
   */
  resolveGeography(
    name: string,
    geographyType: string | undefined,
    ctx: Context,
  ): Promise<ResolvedGeography> {
    ctx.log.info('Resolving geography', { name, geographyType });

    if (this.looksLikeAddress(name)) {
      return this.resolveAddress(name, ctx);
    }

    const detectedType = geographyType ?? this.detectGeographyType(name);
    return this.resolveNamedPlace(name, detectedType, ctx);
  }

  private async resolveNamedPlace(
    name: string,
    geographyType: string,
    ctx: Context,
  ): Promise<ResolvedGeography> {
    // biome-ignore lint/style/noNonNullAssertion: county key is always present in static TIGERWEB_LAYERS
    const layerConfig = TIGERWEB_LAYERS[geographyType] ?? TIGERWEB_LAYERS.county!;
    const { service, layer } = layerConfig;

    const stateMatch = name.match(/,?\s+([A-Z]{2})\s*$/);
    const stateAbbr = stateMatch?.[1];
    const placeName = stateAbbr ? name.replace(/,?\s+[A-Z]{2}\s*$/, '').trim() : name;

    let whereClause = `NAME LIKE '%${placeName.replace(/'/g, "''")}%'`;
    if (stateAbbr) whereClause += ` AND STUSAB='${stateAbbr}'`;

    const outFields =
      geographyType === 'state'
        ? 'NAME,STATE,STUSAB'
        : geographyType === 'county'
          ? 'NAME,STATE,COUNTY,STUSAB'
          : geographyType === 'place'
            ? 'NAME,STATE,PLACE,STUSAB'
            : 'NAME,STATE,COUNTY,TRACT,STUSAB';

    const url = `${TIGERWEB_BASE}/${service}/MapServer/${layer}/query?where=${encodeURIComponent(whereClause)}&outFields=${outFields}&f=json`;

    ctx.log.debug('TIGERweb query', { service, layer, whereClause });

    const data = await withRetry(
      async () => {
        const response = await fetchWithTimeout(url, 10_000, ctx as unknown as RequestContext, {
          signal: ctx.signal,
        });
        const text = await response.text();

        if (/^\s*<(!DOCTYPE\s+html|html[\s>])/i.test(text)) {
          throw serviceUnavailable('TIGERweb returned HTML instead of JSON.', {
            reason: 'resolution_unavailable',
          });
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw serviceUnavailable('TIGERweb response could not be parsed.', {
            reason: 'resolution_unavailable',
          });
        }

        return parsed as TigerwebResponse;
      },
      {
        operation: 'GeographyService.resolveNamedPlace',
        context: ctx as unknown as RequestContext,
        baseDelayMs: 1000,
        signal: ctx.signal,
      },
    );

    if (data.error) {
      throw serviceUnavailable(`TIGERweb error: ${data.error.message}`, {
        reason: 'resolution_unavailable',
      });
    }

    const features = data.features ?? [];

    if (features.length === 0) {
      throw notFound(
        `No geography matched "${name}". Try including the state abbreviation (e.g., "King County, WA") or use a full street address.`,
        {
          reason: 'no_match',
          name,
          geographyType,
          recovery: {
            hint: `Try a more specific name with state abbreviation (e.g., "King County, WA"), or use a full address.`,
          },
        },
      );
    }

    if (features.length > 3) {
      const candidates = features.slice(0, 10).map((f) => ({
        name: String(f.attributes.NAME ?? ''),
        geographyType,
        stateFips: String(f.attributes.STATE ?? ''),
        stateName: String(f.attributes.STUSAB ?? ''),
        ...(f.attributes.COUNTY !== undefined && {
          countyFips: String(f.attributes.COUNTY),
        }),
      }));

      const candidateList = candidates.map((c) => `"${c.name}, ${c.stateName}"`).join(', ');
      throw Object.assign(
        new Error(
          `"${name}" matched ${features.length} geographies — include the state abbreviation`,
        ),
        {
          code: -32602,
          data: {
            reason: 'ambiguous_name',
            candidates,
            recovery: {
              hint: `Use one of: ${candidateList}`,
            },
          },
        },
      );
    }

    // biome-ignore lint/style/noNonNullAssertion: guarded by features.length > 3 check above (exactly 1-3 matches)
    const feature = features[0]!;
    const attrs = feature.attributes;

    const stateFips = String(attrs.STATE ?? '').padStart(2, '0');
    const countyFipsRaw = attrs.COUNTY;
    const placeFipsRaw = attrs.PLACE;
    const tractFipsRaw = attrs.TRACT;

    const countyFips =
      countyFipsRaw !== undefined ? String(countyFipsRaw).padStart(3, '0') : undefined;
    const placeFips = placeFipsRaw !== undefined ? String(placeFipsRaw) : undefined;
    const tractFips = tractFipsRaw !== undefined ? String(tractFipsRaw) : undefined;

    const fipsSummary =
      geographyType === 'state'
        ? stateFips
        : geographyType === 'county' && countyFips
          ? countyFips
          : geographyType === 'place' && placeFips
            ? placeFips
            : (tractFips ?? stateFips);

    const result: ResolvedGeography = {
      name: String(attrs.NAME ?? name),
      geographyType,
      stateFips,
      fipsSummary,
    };

    if (countyFips) result.countyFips = countyFips;
    if (tractFips) result.tractFips = tractFips;
    if (placeFips) result.placeFips = placeFips;

    return result;
  }

  private async resolveAddress(address: string, ctx: Context): Promise<ResolvedGeography> {
    const url = `${GEOCODER_BASE}?address=${encodeURIComponent(address)}&benchmark=4&vintage=4&layers=8,12,28&format=json`;

    ctx.log.debug('Census Geocoder query', { address });

    const data = await withRetry(
      async () => {
        const response = await fetchWithTimeout(url, 15_000, ctx as unknown as RequestContext, {
          signal: ctx.signal,
        });
        const text = await response.text();

        if (/^\s*<(!DOCTYPE\s+html|html[\s>])/i.test(text)) {
          throw serviceUnavailable('Census Geocoder returned HTML instead of JSON.', {
            reason: 'resolution_unavailable',
          });
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw serviceUnavailable('Census Geocoder response could not be parsed.', {
            reason: 'resolution_unavailable',
          });
        }

        return parsed as GeocoderResult;
      },
      {
        operation: 'GeographyService.resolveAddress',
        context: ctx as unknown as RequestContext,
        baseDelayMs: 1000,
        signal: ctx.signal,
      },
    );

    const matches = data.result?.addressMatches ?? [];

    if (matches.length === 0) {
      throw notFound(
        `Address "${address}" could not be geocoded. Verify the address format and include a ZIP code.`,
        {
          reason: 'no_match',
          address,
          recovery: {
            hint: `Include a full address with ZIP code (e.g., "1600 Pennsylvania Ave NW, Washington, DC 20500").`,
          },
        },
      );
    }

    // biome-ignore lint/style/noNonNullAssertion: guarded by matches.length === 0 check above
    const match = matches[0]!;
    const geos = match.geographies ?? {};
    const stateGeo = (geos.States ?? [])[0];
    const countyGeo = (geos.Counties ?? [])[0];
    const tractGeo = (geos['Census Tracts'] ?? [])[0];

    const stateFips = stateGeo?.STATE ? String(stateGeo.STATE).padStart(2, '0') : '';
    const countyFips = countyGeo?.COUNTY ? String(countyGeo.COUNTY).padStart(3, '0') : undefined;
    const tractFips = tractGeo?.TRACT ? String(tractGeo.TRACT) : undefined;

    if (!stateFips) {
      throw notFound('Geocoder matched address but returned no geographic identifiers.', {
        reason: 'no_match',
        address,
        recovery: { hint: 'Verify the address is in a valid US location.' },
      });
    }

    const geographyType = tractFips ? 'tract' : countyFips ? 'county' : 'state';
    const fipsSummary = tractFips ?? countyFips ?? stateFips;

    const result: ResolvedGeography = {
      name: match.matchedAddress,
      geographyType,
      stateFips,
      fipsSummary,
    };

    if (countyFips) result.countyFips = countyFips;
    if (tractFips) result.tractFips = tractFips;

    return result;
  }

  private detectGeographyType(name: string): string {
    const lower = name.toLowerCase();
    if (lower.includes('county') || lower.includes('borough') || lower.includes('parish'))
      return 'county';
    if (lower.includes('tract')) return 'tract';
    if (/^[A-Z]{2}$/.test(name.trim())) return 'state';
    return 'county';
  }

  private looksLikeAddress(name: string): boolean {
    return /^\d+\s+\w/.test(name.trim());
  }
}

// --- Init/accessor pattern ---

let _service: GeographyService | undefined;

export function initGeographyService(_config: AppConfig, _storage: StorageService): void {
  _service = new GeographyService();
}

export function getGeographyService(): GeographyService {
  if (!_service) {
    throw new Error('GeographyService not initialized — call initGeographyService() in setup()');
  }
  return _service;
}
