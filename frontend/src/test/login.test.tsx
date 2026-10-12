import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import LoginPage from '@/pages/LoginPage';
import { mockApi, mockUser, renderApp } from './utils';

const tree = (
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/" element={<p>Dashboard home</p>} />
  </Routes>
);

describe('LoginPage', () => {
  it('validates required fields before calling the API', async () => {
    const calls = mockApi({ 'GET /auth/me': () => ({ __status: 401, body: { error: { code: 'UNAUTHORIZED', message: 'no' } } }) });
    renderApp(tree, { route: '/login' });
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(calls.some((c) => c.key === 'POST /auth/login')).toBe(false);
  });

  it('rejects a malformed email', async () => {
    mockApi({ 'GET /auth/me': () => ({ __status: 401, body: { error: { code: 'UNAUTHORIZED', message: 'no' } } }) });
    renderApp(tree, { route: '/login' });
    await userEvent.type(await screen.findByLabelText('Email'), 'not-an-email');
    await userEvent.type(screen.getByLabelText('Password'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
  });

  it('shows the server error for bad credentials', async () => {
    mockApi({
      'GET /auth/me': () => ({ __status: 401, body: { error: { code: 'UNAUTHORIZED', message: 'x' } } }),
      'POST /auth/login': () => ({ __status: 401, body: { error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' } } }),
    });
    renderApp(tree, { route: '/login' });
    await userEvent.type(await screen.findByLabelText('Email'), 'a@b.co');
    await userEvent.type(screen.getByLabelText('Password'), 'wrongpass');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
  });

  it('fills credentials from a demo account and signs in', async () => {
    const calls = mockApi({
      'GET /auth/me': () => ({ __status: 401, body: { error: { code: 'UNAUTHORIZED', message: 'x' } } }),
      'POST /auth/login': () => ({ data: { user: mockUser('CLINICIAN'), token: 't' } }),
    });
    renderApp(tree, { route: '/login' });
    await userEvent.click(await screen.findByRole('button', { name: /Clinician/ }));
    expect(screen.getByLabelText('Email')).toHaveValue('clinician@cevi.demo');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(screen.getByText('Dashboard home')).toBeInTheDocument());
    expect(calls.find((c) => c.key === 'POST /auth/login')?.body).toMatchObject({ email: 'clinician@cevi.demo' });
  });
});
