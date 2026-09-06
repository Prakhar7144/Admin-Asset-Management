import test from 'node:test';
import assert from 'node:assert/strict';
import { getEmployeeStatus } from '../utils/dateUtils.js';

test('future leaving date is treated as pending release', () => {
  const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 5).toISOString().slice(0, 10);
  assert.equal(getEmployeeStatus(future), 'Pending Release');
});

test('past leaving date is treated as released', () => {
  const past = new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString().slice(0, 10);
  assert.equal(getEmployeeStatus(past), 'Released');
});

test('no leaving date stays active', () => {
  assert.equal(getEmployeeStatus(''), 'Active');
});

test('archived employees remain archived regardless of date', () => {
  const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 5).toISOString().slice(0, 10);
  assert.equal(getEmployeeStatus(future, true), 'Archived');
});
