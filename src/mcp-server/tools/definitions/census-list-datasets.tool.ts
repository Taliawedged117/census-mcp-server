/**
 * @fileoverview Tool to list available Census Bureau datasets and their vintage years.
 * @module mcp-server/tools/definitions/census-list-datasets
 */

import { tool, z } from '@cyanheads/mcp-ts-core';

/** Static dataset catalog. Census dataset metadata doesn't change frequently. */
const DATASETS = [
  {
    datasetId: 'acs/acs5',
    name: 'American Community Survey 5-Year Estimates',
    description:
      'ACS 5-year estimates covering all geographies down to block group. Most reliable for small areas. The default for most use cases.',
    availableYears: [
      2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024,
    ],
  },
  {
    datasetId: 'acs/acs5/profile',
    name: 'ACS 5-Year Data Profiles',
    description:
      'Pre-computed ACS5 social, economic, housing, and demographic profiles. Simpler DP-prefix codes (e.g., DP03_0062E) covering ~80% of common queries. Recommended starting point.',
    availableYears: [
      2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024,
    ],
  },
  {
    datasetId: 'acs/acs5/subject',
    name: 'ACS 5-Year Subject Tables',
    description:
      'ACS5 subject tables with S-prefix codes. Organized by topic (income, poverty, education, housing). More readable than B-table codes.',
    availableYears: [
      2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024,
    ],
  },
  {
    datasetId: 'acs/acs1',
    name: 'American Community Survey 1-Year Estimates',
    description:
      'ACS 1-year estimates — more current but only covers geographies with 65,000+ population. Tracts, block groups, and most rural counties are not available. Note: 2020 ACS1 was not released due to COVID-19.',
    availableYears: [
      2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019,
      2021, 2022, 2023, 2024,
    ],
  },
  {
    datasetId: 'acs/acs1/profile',
    name: 'ACS 1-Year Data Profiles',
    description:
      'ACS 1-year data profiles with DP-prefix codes. Same coverage restriction as ACS1 (65K+ population geographies only).',
    availableYears: [
      2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2021, 2022, 2023, 2024,
    ],
  },
  {
    datasetId: 'pep/charv',
    name: 'Population Estimates Program',
    description:
      'Annual population estimates between decennial censuses, including age, sex, race, and Hispanic origin characteristics.',
    availableYears: [2020, 2021, 2022, 2023],
  },
  {
    datasetId: 'dec/pl',
    name: 'Decennial Census Redistricting Data (P.L. 94-171)',
    description:
      'Decennial Census population and housing unit counts used for congressional redistricting. Most granular geography coverage.',
    availableYears: [2000, 2010, 2020],
  },
  {
    datasetId: 'dec/ddhca',
    name: 'Decennial Census Demographic and Housing Characteristics',
    description: 'Detailed demographic and housing characteristics from the Decennial Census.',
    availableYears: [2020],
  },
];

export const censusListDatasets = tool('census_list_datasets', {
  title: 'List Census Datasets',
  description:
    'Browse available Census Bureau datasets with their supported vintage years. Use as the starting point when the right dataset is unknown — ACS5, ACS1, population estimates, and decennial census serve different use cases. Pass the dataset_id value to the dataset parameter in other census tools.',
  annotations: { readOnlyHint: true, openWorldHint: false },
  input: z.object({
    filter: z
      .string()
      .optional()
      .describe('Keyword to filter datasets by name or description. Omit to list all datasets.'),
  }),
  output: z.object({
    datasets: z
      .array(
        z
          .object({
            dataset_id: z
              .string()
              .describe(
                'Dataset code to pass to the dataset parameter in other tools (e.g., "acs/acs5", "acs/acs5/profile").',
              ),
            name: z.string().describe('Human-readable dataset name.'),
            description: z
              .string()
              .describe('Description of the dataset including coverage and use case guidance.'),
            available_years: z
              .array(z.number())
              .describe('Vintage years available for this dataset.'),
          })
          .describe('A single Census dataset entry.'),
      )
      .describe('Matching Census datasets.'),
    total_count: z.number().describe('Total number of matching datasets.'),
  }),

  handler(input, ctx) {
    ctx.log.info('Listing Census datasets', { filter: input.filter });

    let results = DATASETS;

    if (input.filter?.trim()) {
      const filterLower = input.filter.toLowerCase();
      results = DATASETS.filter(
        (d) =>
          d.name.toLowerCase().includes(filterLower) ||
          d.description.toLowerCase().includes(filterLower) ||
          d.datasetId.toLowerCase().includes(filterLower),
      );
    }

    return {
      datasets: results.map((d) => ({
        dataset_id: d.datasetId,
        name: d.name,
        description: d.description,
        available_years: d.availableYears,
      })),
      total_count: results.length,
    };
  },

  format: (result) => {
    const lines: string[] = [`**${result.total_count} datasets**\n`];
    for (const d of result.datasets) {
      lines.push(`### ${d.name}`);
      lines.push(`**ID:** \`${d.dataset_id}\``);
      lines.push(d.description);
      lines.push(`**Years:** ${d.available_years.join(', ')}\n`);
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
