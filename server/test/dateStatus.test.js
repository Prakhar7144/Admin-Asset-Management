import test from 'node:test';
import assert from 'node:assert/strict';
import { getEmployeeStatus } from '../utils/dateUtils.js';

test('future leaving date remains active until its date is reached', () => {
  const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 5).toISOString().slice(0, 10);
  assert.equal(getEmployeeStatus(future), 'Active');
});

test('past leaving date remains pending release until IT NOC is completed', () => {
  const past = new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString().slice(0, 10);
  assert.equal(getEmployeeStatus(past), 'Pending Release');
});

test('no leaving date stays active', () => {
  assert.equal(getEmployeeStatus(''), 'Active');
});

test('archived employees remain archived regardless of date', () => {
  const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 5).toISOString().slice(0, 10);
  assert.equal(getEmployeeStatus(future, true), 'Archived');
});
