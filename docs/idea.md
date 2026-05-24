# census-mcp-server

MCP server for US Census Bureau data — demographics, population, housing, and economic statistics.

## Why

Demographics are foundational data. Population counts, income distributions, housing characteristics, migration patterns — these underpin policy analysis, market sizing, social research, and geographic reasoning. No existing server covers this domain.

## Source

- **API:** US Census Bureau Data API (https://api.census.gov/data)
- **Auth:** Free API key (https://api.census.gov/data/key_signup.html) — works without a key at lower rate limits
- **Rate limits:** 500 requests/day without key, higher with key
- **Docs:** https://www.census.gov/data/developers/guidance.html

## Scope

### Core datasets

| Dataset | Code | Description |
|---|---|---|
| American Community Survey 1-Year | `acs/acs1` | Detailed demographics for areas with 65K+ population, annually |
| American Community Survey 5-Year | `acs/acs5` | Same detail for all geographies down to block group, 5-year rolling |
| Decennial Census | `dec/pl` | Official population counts, redistricting data, every 10 years |
| Population Estimates | `pep/population` | Intercensal estimates by age, sex, race, Hispanic origin |

### Core tools

| Tool | Description |
|---|---|
| `census_search_variables` | Search available variables by keyword (e.g., "median income", "housing units") |
| `census_get_data` | Query a dataset — specify variables, geography, year, optional filters |
| `census_list_geographies` | Available geography levels for a dataset (state, county, tract, block group, etc.) |
| `census_list_datasets` | Browse available datasets and vintages |
| `census_get_variable_info` | Metadata for a specific variable — label, concept, predicateType |

### Potential additions

- **`census_compare`** — side-by-side comparison of a variable across geographies or years
- Economic Census data (business patterns, industry statistics)
- Geographic cross-reference (FIPS codes to names, CBSA/MSA lookups)

## Design notes

- The Census API is variable-based: you request specific variable codes (e.g., `B01001_001E` for total population) for a geography. The variable discovery tools are critical — there are thousands of variables.
- Geography hierarchy matters: state > county > tract > block group. The `for`/`in` parameter syntax (`?get=B01001_001E&for=county:*&in=state:53`) is the query pattern.
- ACS 1-year vs 5-year is a common confusion point — 1-year has limited geography coverage but is more current; 5-year covers everything but is a rolling average. Surface this distinction in tool descriptions.
- Variable names are cryptic (`B19013_001E`). Search and metadata tools should resolve these to human-readable labels.
