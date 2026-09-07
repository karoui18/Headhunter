import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AddJob } from '../components/editors';
describe('accessible ingestion form', () => {
  it('rejects unsafe URLs before calling the import port', async () => {
    const onAdd = vi.fn();
    render(<AddJob onAdd={onAdd} />);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Analyst' } });
    fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'Example' } });
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: 'javascript:alert(1)' } });
    fireEvent.change(screen.getByLabelText('Job description'), { target: { value: 'A job' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Add to job library' }).closest('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('HTTP');
    expect(onAdd).not.toHaveBeenCalled();
  });
});
