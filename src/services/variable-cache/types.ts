/**
 * @fileoverview Domain types for the Census variable cache service.
 * @module services/variable-cache/types
 */

/** A single variable entry from Census variables.json. */
export interface CensusVariable {
  /** Variable code (e.g., "B19013_001E"). */
  code: string;
  /** Concept group the variable belongs to (e.g., "MEDIAN HOUSEHOLD INCOME IN THE PAST 12 MONTHS"). */
  concept: string;
  /** Corresponding estimate variable code when this is a MOE variable. */
  estimateCode?: string;
  /** Human-readable label (e.g., "Estimate!!Median household income in the past 12 months"). */
  label: string;
  /** Corresponding MOE variable code when this is an estimate variable. */
  moeCode?: string;
  /** Predicate type (e.g., "int", "string", "float"). */
  predicateType: string;
  /** Universe the variable applies to (e.g., "Households"). */
  universe?: string;
}

/** Raw variables.json structure from Census API. */
export interface RawVariablesJson {
  variables: Record<string, RawVariableEntry>;
}

/** A single raw entry from variables.json. */
export interface RawVariableEntry {
  attributes?: string;
  concept?: string;
  group?: string;
  label: string;
  limit?: number;
  predicateType?: string;
  universe?: string;
}

/** Cache key for a dataset+year combination. */
export interface VariableCacheKey {
  dataset: string;
  year: number;
}
