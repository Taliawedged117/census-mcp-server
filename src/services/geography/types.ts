/**
 * @fileoverview Domain types for the Census geography resolution service.
 * @module services/geography/types
 */

/** Resolved geography with FIPS identifiers. */
export interface ResolvedGeography {
  /** 3-digit county FIPS code (when applicable). */
  countyFips?: string;
  /** Pre-formatted FIPS value ready to pass as geography_fips to census_query_data. */
  fipsSummary: string;
  /** Geography type (state, county, place, tract). */
  geographyType: string;
  /** Canonical name of the resolved geography. */
  name: string;
  /** Place FIPS code (when applicable). */
  placeFips?: string;
  /** 2-digit state FIPS code. */
  stateFips: string;
  /** 6-digit tract FIPS code (when applicable). */
  tractFips?: string;
}

/** A candidate match when name resolution is ambiguous. */
export interface GeographyCandidate {
  countyFips?: string;
  geographyType: string;
  name: string;
  stateFips: string;
  stateName: string;
}

/** TIGERweb MapServer query response shape. */
export interface TigerwebFeature {
  attributes: {
    NAME: string;
    STATE: string;
    COUNTY?: string;
    PLACE?: string;
    TRACT?: string;
    [key: string]: string | number | undefined;
  };
}

export interface TigerwebResponse {
  error?: { message: string };
  features?: TigerwebFeature[];
}

/** Census Geocoder response shape. */
export interface GeocoderResult {
  input?: { address?: { address: string } };
  result?: {
    addressMatches?: GeocoderMatch[];
  };
}

export interface GeocoderMatch {
  geographies?: {
    States?: Array<{ STATE: string }>;
    Counties?: Array<{ STATE: string; COUNTY: string }>;
    'Census Tracts'?: Array<{ STATE: string; COUNTY: string; TRACT: string }>;
  };
  matchedAddress: string;
}
