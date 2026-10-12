import { render, screen } from '@testing-library/react';
import { formatBytes, formatMs, percent, timeAgo, titleCase } from '@/lib/format';
import { validateImageFile } from '@/components/forms/ImageUploadDialog';
import { AnalysisStatusBadge, ResearchDisclaimer } from '@/components/common';
import { AnalysisResultView } from '@/components/AnalysisDetail';
import { patientSchema, validateForm } from '@/lib/validation';
import { ApiError } from '@/lib/api';
import type { Analysis } from '@/lib/types';

describe('formatting helpers', () => {
  it('formats values', () => {
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatMs(1500)).toBe('1.50 s');
    expect(formatMs(null)).toBe('—');
    expect(percent(0.1234)).toBe('12.3%');
    expect(titleCase('DIAGNOSTIC_NOTE')).toBe('Diagnostic Note');
    expect(timeAgo(new Date(Date.now() - 3 * 3600_000).toISOString())).toBe('3h ago');
  });
});

describe('image file validation', () => {
  const f = (type: string, size = 1000) => new File([new Uint8Array(size)], 'x', { type });
  it('accepts JPEG/PNG and rejects others', () => {
    expect(validateImageFile(f('image/png'))).toBeNull();
    expect(validateImageFile(f('application/pdf'))).toMatch(/Only JPEG and PNG/);
    expect(validateImageFile(f('image/png', 9 * 1024 * 1024))).toMatch(/too large/);
    expect(validateImageFile(null)).toMatch(/Choose/);
  });
});

describe('forms & API errors', () => {
  it('patient schema rejects future dates', () => {
    const r = validateForm(patientSchema, { firstName: 'A', lastName: 'B', dateOfBirth: '2999-01-01', sex: 'MALE', researchCohort: 'Cohort', caseStatus: 'ACTIVE' });
    expect(r.errors?.dateOfBirth).toMatch(/future/);
  });
  it('ApiError exposes field errors', () => {
    const e = new ApiError(422, 'VALIDATION_ERROR', 'bad', [{ field: 'title', message: 'Too short' }]);
    expect(e.fieldErrors).toEqual({ title: 'Too short' });
  });
});

describe('safety UI', () => {
  it('always renders the research-use disclaimer', () => {
    render(<ResearchDisclaimer />);
    expect(screen.getByRole('note')).toHaveTextContent(/must not be used for diagnosis/);
  });
  it('labels unavailable analyses and shows no fabricated predictions', () => {
    const a = {
      id: '1', status: 'UNAVAILABLE', mode: 'EXPERIMENTAL_INFERENCE', modelName: null, modelVersion: null, weightsSource: null, predictions: null,
      preprocessing: null, contextSnapshot: null, inferenceMs: null, totalMs: 5, errorMessage: 'x', isSynthetic: false, createdAt: new Date().toISOString(),
      completedAt: null, requestedBy: { id: 'u', name: 'Dr Test', role: 'CLINICIAN' }, image: { id: 'i', originalName: 'a.png', width: 64, height: 64, modality: 'XRAY', mimeType: 'image/png', sizeBytes: 1 },
      patient: { id: 'p', syntheticId: 'SYN-1', displayName: 'X' }, disclaimer: '',
    } as unknown as Analysis;
    render(<AnalysisResultView a={a} />);
    expect(screen.getByText('Model inference unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Top predictions')).toBeNull();
  });
  it('renders status badges', () => {
    render(<AnalysisStatusBadge status="COMPLETED" />);
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });
});
