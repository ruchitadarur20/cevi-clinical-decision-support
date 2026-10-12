import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '@/App';
import { mockApi, mockUser, renderApp } from './utils';
import type { Role } from '@/lib/types';

const emptyList = { data: [], meta: { page: 1, pageSize: 12, total: 0, totalPages: 1 } };
const dashboard = {
  data: {
    dataNotice: 'All patient data in this environment is synthetic and generated for demonstration purposes.',
    totals: { patients: 30, activeCases: 15, records: 107, images: 20, analysesCompleted: 16, analysesPending: 0, analysesFailed: 0, analysesUnavailable: 0, recordsLast14Days: 4 },
    activitySeries: [], caseDistribution: [], cohortDistribution: [], imageProcessing: [], recentAnalyses: [], recentActivity: [],
  },
};

function setup(role: Role, route = '/') {
  return mockApi({
    'GET /auth/me': () => ({ data: { user: mockUser(role) } }),
    'GET /dashboard': () => dashboard,
    'GET /activity': () => ({ data: [] }),
    'GET /patients': () => emptyList,
    'GET /patients/cohorts': () => ({ data: [] }),
    'GET /analytics/summary': () => ({ __status: 403, body: { error: { code: 'FORBIDDEN', message: 'nope' } } }),
  }), renderApp(<App />, { route });
}

describe('navigation and role-aware UI', () => {
  it('renders the overview with database-backed totals', async () => {
    setup('CLINICIAN');
    expect(await screen.findByText('Synthetic patients')).toBeInTheDocument();
    expect(await screen.findByText('107')).toBeInTheDocument();
    expect(screen.getByText(/Synthetic data environment/)).toBeInTheDocument();
  });

  it('shows every sidebar section a clinician may use but hides admin/analytics', async () => {
    setup('CLINICIAN');
    const nav = await screen.findByRole('navigation', { name: 'Primary' });
    for (const label of ['Overview', 'Patients', 'Clinical Records', 'Medical Imaging', 'AI Analysis', 'Analysis History', 'Settings'])
      expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Users & Roles' })).toBeNull();
    expect(within(nav).queryByRole('link', { name: 'Research Analytics' })).toBeNull();
  });

  it('shows Users & Roles only for administrators', async () => {
    setup('ADMINISTRATOR');
    const nav = await screen.findByRole('navigation', { name: 'Primary' });
    expect(within(nav).getByRole('link', { name: 'Users & Roles' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Research Analytics' })).toBeInTheDocument();
  });

  it('navigates between pages through the sidebar', async () => {
    setup('CLINICIAN');
    const nav = await screen.findByRole('navigation', { name: 'Primary' });
    await userEvent.click(within(nav).getByRole('link', { name: 'Patients' }));
    expect(await screen.findByRole('heading', { name: 'Patients', level: 1 })).toBeInTheDocument();
  });

  it('blocks routes the role lacks permission for', async () => {
    setup('CLINICIAN', '/users');
    expect(await screen.findByText(/don't have access to this area/)).toBeInTheDocument();
  });

  it('redirects unauthenticated visitors to the login page', async () => {
    mockApi({ 'GET /auth/me': () => ({ __status: 401, body: { error: { code: 'UNAUTHORIZED', message: 'x' } } }) });
    renderApp(<App />, { route: '/patients' });
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('toggles dark mode', async () => {
    setup('CLINICIAN');
    await userEvent.click(await screen.findByRole('button', { name: /Switch to dark mode/ }));
    expect(document.documentElement).toHaveClass('dark');
    await userEvent.click(screen.getByRole('button', { name: /Switch to light mode/ }));
    expect(document.documentElement).not.toHaveClass('dark');
  });
});
