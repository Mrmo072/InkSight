import '@testing-library/jest-dom';
import { afterEach, vi } from 'vitest';

afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    vi.restoreAllMocks();
});
