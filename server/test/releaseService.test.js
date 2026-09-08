import test from 'node:test';
import assert from 'node:assert/strict';
import { getReleaseCandidates } from '../services/releaseService.js';

test('returns only employees whose leaving date is reached', () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const formatLocalDate = (date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  const future = formatLocalDate(new Date(today.getTime() + 86400000));
  const past = formatLocalDate(new Date(today.getTime() - 86400000));
  const todayText = formatLocalDate(today);

  const employees = [
    { _id: '1', isArchived: false, dateOfLeaving: future, status: 'Active' },
    { _id: '2', isArchived: false, dateOfLeaving: past, status: 'Pending Release' },
    { _id: '3', isArchived: false, dateOfLeaving: todayText, status: 'Pending Release' },
    { _id: '4', isArchived: true, dateOfLeaving: past, status: 'Archived' },
    { _id: '5', isArchived: false, dateOfLeaving: '', status: 'Active' },
  ];

  const releaseCandidates = getReleaseCandidates(employees, today);
  assert.equal(releaseCandidates.length, 2);
  assert.deepEqual(releaseCandidates.map((employee) => employee._id), ['2', '3']);
});
