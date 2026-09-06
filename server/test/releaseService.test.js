import test from 'node:test';
import assert from 'node:assert/strict';
import { getReleaseCandidates } from '../services/releaseService.js';

test('returns only employees whose leaving date is reached', () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const future = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);
  const past = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);
  const todayText = today.toISOString().slice(0, 10);

  const employees = [
    { _id: '1', isArchived: false, dateOfLeaving: future, status: 'Pending Release' },
    { _id: '2', isArchived: false, dateOfLeaving: past, status: 'Pending Release' },
    { _id: '3', isArchived: false, dateOfLeaving: todayText, status: 'Pending Release' },
    { _id: '4', isArchived: true, dateOfLeaving: past, status: 'Archived' },
    { _id: '5', isArchived: false, dateOfLeaving: '', status: 'Active' },
  ];

  const releaseCandidates = getReleaseCandidates(employees, today);
  assert.equal(releaseCandidates.length, 2);
  assert.deepEqual(releaseCandidates.map((employee) => employee._id), ['2', '3']);
});
