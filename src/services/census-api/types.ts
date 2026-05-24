/**
 * @fileoverview Domain types for the Census Bureau Data API service.
 * @module services/census-api/types
 */

/** A single row of Census API data with labeled variable values. */
export interface CensusDataRow {
  /** FIPS code of the geography at the queried level (e.g., "033"). */
  geographyFips: string;
  /** Human-readable geography name (e.g., "King County, Washington"). */
  geographyName: string;
  /** Map of variable code to parsed value entry. */
  variables: Record<string, CensusVariableValue>;
}

/** A single variable value from a Census data query. */
export interface CensusVariableValue {
  /** Numeric estimate, or null if suppressed. */
  estimate: number | null;
  /** Human-readable label for this variable code. */
  label: string;
  /** Margin of error if the corresponding MOE variable was requested. */
  moe?: number | null;
  /** Whether this value was suppressed (negative sentinel code). */
  suppressed: boolean;
  /** Human-readable explanation when suppressed. */
  suppressionReason?: string;
}

/** Raw Census API JSON response — array of arrays, first row is headers. */
export type CensusRawResponse = string[][];

/** Suppression code meanings. */
export const SUPPRESSION_CODES: Record<string, string> = {
  '-666666666': 'Not available — geography too small or data not collected',
  '-222222222': 'Not applicable',
  '-888888888': 'Estimate revised or superseded',
  '-999999999': 'Median falls in upper or lower open-ended interval',
};
