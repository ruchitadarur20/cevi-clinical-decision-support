import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PatientsPage from '@/pages/PatientsPage';
import { mockApi, mockUser, renderApp } from './utils';
import type { Role } from '@/lib/types';

const patient = (over: Record<string, unknown> = {}) => ({
  id: '11111111-1111-4111-8111-111111111111', syntheticId: 'SYN-000001', firstName: 'Ada', lastName: 'Lovelace', displayName: 'Lovelace, Ada',
  dateOfBirth: '1980-01-01', age: 46, ageBand: '40-49', sex: 'FEMALE', researchCohort: 'Thoracic Imaging Study', caseStatus: 'ACTIVE',
  summary: null, isSynthetic: true, anonymized: false, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', recordCount: 3, imageCount: 1, ...over,
});

function setup(role: Role = 'CLINICIAN') {
  return mockApi({
    'GET /auth/me': () => ({ data: { user: mockUser(role) } }),
    'GET /patients': (url) => {
      const q = url.searchParams.get('q');
      const status = url.searchParams.get('status');
      const rows = [patient(), patient({ id: '22222222-2222-4222-8222-222222222222', syntheticId: 'SYN-000002', displayName: 'Turing, Alan', caseStatus: 'CLOSED' })]
        .filter((p) => !q || p.displayName.toLowerCase().includes(q.toLowerCase()))
        .filter((p) => !status || p.caseStatus === status);
      return { data: rows, meta: { page: 1, pageSize: 12, total: rows.length, totalPages: 1 } };
    },
    'GET /patients/cohorts': () => ({ data: [{ name: 'Thoracic Imaging Study', count: 2 }] }),
    'POST /patients': () => ({ __status: 201, body: { data: patient({ id: '33333333-3333-4333-8333-333333333333', syntheticId: 'SYN-000003' }) } }),
  });
}

describe('PatientsPage', () => {
  it('lists patients from the API', async () => {
    setup();
    renderApp(<PatientsPage />, { route: '/patients' });
    expect(await screen.findByText('Lovelace, Ada')).toBeInTheDocument();
    expect(screen.getByText('Turing, Alan')).toBeInTheDocument();
  });

  it('sends the search term to the API and updates the table', async () => {
    const calls = setup();
    renderApp(<PatientsPage />, { route: '/patients' });
    await screen.findByText('Lovelace, Ada');
    await userEvent.type(screen.getByLabelText(/Search by name/), 'turing');
    await waitFor(() => expect(screen.queryByText('Lovelace, Ada')).toBeNull());
    expect(screen.getByText('Turing, Alan')).toBeInTheDocument();
    expect(calls.some((c) => c.url.searchParams.get('q') === 'turing')).toBe(true);
  });

  it('filters by case status', async () => {
    setup();
    renderApp(<PatientsPage />, { route: '/patients' });
    await screen.findByText('Lovelace, Ada');
    await userEvent.selectOptions(screen.getByLabelText('Filter by status'), 'CLOSED');
    await waitFor(() => expect(screen.queryByText('Lovelace, Ada')).toBeNull());
    expect(screen.getByText('Turing, Alan')).toBeInTheDocument();
  });

  it('shows an empty state when nothing matches', async () => {
    setup();
    renderApp(<PatientsPage />, { route: '/patients?q=zzzz' });
    expect(await screen.findByText('No patients match your filters')).toBeInTheDocument();
  });

  it('validates the registration form and submits valid data', async () => {
    const calls = setup();
    renderApp(<PatientsPage />, { route: '/patients' });
    await userEvent.click(await screen.findByRole('button', { name: /Register patient/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Register patient' }));
    expect(await screen.findByText('First name is required')).toBeInTheDocument();
    expect(screen.getByText('Research cohort is required')).toBeInTheDocument();
    expect(calls.some((c) => c.key === 'POST /patients')).toBe(false);

    await userEvent.type(screen.getByLabelText('First name'), 'Grace');
    await userEvent.type(screen.getByLabelText('Last name'), 'Hopper');
    await userEvent.type(screen.getByLabelText('Date of birth'), '1975-12-09');
    await userEvent.type(screen.getByLabelText('Research cohort'), 'General Observation');
    await userEvent.click(screen.getByRole('button', { name: 'Register patient' }));
    await waitFor(() => expect(calls.find((c) => c.key === 'POST /patients')).toBeTruthy());
    expect(calls.find((c) => c.key === 'POST /patients')?.body).toMatchObject({ firstName: 'Grace', lastName: 'Hopper', researchCohort: 'General Observation' });
  });

  it('hides the register button for roles without write permission', async () => {
    setup('RESEARCHER');
    renderApp(<PatientsPage />, { route: '/patients' });
    await screen.findByText('Lovelace, Ada');
    expect(screen.queryByRole('button', { name: /Register patient/ })).toBeNull();
  });
});
