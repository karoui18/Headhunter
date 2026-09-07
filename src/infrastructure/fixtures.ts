import { normalizeJob } from '../application/normalize';
const titles = [
  'Senior Business Analyst',
  'Transformation Lead',
  'Senior Product Owner',
  'Program Manager',
  'Capital Markets Business Analyst',
  'AML Transformation Manager',
  'Junior Operations Analyst',
];
const companies = [
  'Northstar Markets',
  'Meridian Financial',
  'Atlas Advisory',
  'Cedar Fintech',
  'Horizon Capital',
  'Lumière Banking',
];
const locations = [
  'Paris, France',
  'Zürich, Switzerland',
  'Luxembourg',
  'London, United Kingdom',
  'Berlin, Germany',
  'Dubai, UAE',
];
const policies = [
  'Fully remote across EU. Work from abroad allowed under written company policy.',
  'Hybrid, 2 days per week in office.',
  'On-site only. Relocation required.',
  'Remote in France, 2 days per month in Paris.',
  'Remote-first worldwide. 30 days per year work from abroad.',
  'Flexible workplace.',
];
export async function fixtureJobs() {
  return Promise.all(
    Array.from({ length: 42 }, (_, i) =>
      normalizeJob(
        {
          title: titles[i % 7],
          company: companies[Math.floor(i / 7)],
          location: locations[Math.floor(i / 7)],
          url: `https://example.com/sample-job/${i + 1}`,
          description: `${titles[i % 7]} in financial services and ${i % 3 ? 'capital markets transformation' : 'AML regulatory operations'}. Lead stakeholder management, agile product strategy and project management with global EMEA teams. ${policies[i % 6]} ${i % 2 ? 'International travel 20% expected.' : 'No travel required.'} ${i % 3 === 0 ? 'EUR 90,000–110,000 per year.' : i % 3 === 1 ? 'CHF 120,000–145,000 per year.' : 'Competitive salary.'} ${i % 7 === 6 ? '1 year experience required.' : '10 years experience required. English required; French preferred. PMP preferred.'} This is a fictional development example, not an open vacancy.`,
          publishedAt: new Date(Date.now() - (i % 14) * 86400000).toISOString(),
          fixture: true,
        },
        'sample',
      ),
    ),
  );
}
