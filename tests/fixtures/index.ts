export const tokenBody = {
  access_token: 'fake-access-token',
  token_type: 'bearer',
  expires_in: '86399',
  refresh_token: 'fake-refresh-token',
};

export const invalidGrantBody = { error: 'invalid_grant', error_description: 'Invalid credentials' };

export const group = { id: 'grp-1', name: 'Test Group' };
export const account = { id: 'acc-1', name: 'Test Account', group_id: 'grp-1', timezone: 'UTC' };
export const recording = {
  id: 'rec-1',
  account_id: 'acc-1',
  duration: 120,
  created_at: '2026-09-28T00:00:00Z',
  tags: ['sales'],
};
export const dubberUser = { id: 'usr-1', email: 'agent@example.com', name: 'Agent Smith', account_id: 'acc-1' };
export const profile = { id: 'usr-1', email: 'agent@example.com', name: 'Agent Smith' };
export const notification = { id: 'notif-1', url: 'https://example.com/hook', event: 'recording.created', active: false };
export const dubPoint = { id: 'dp-1', name: 'Main BroadWorks trunk', account_id: 'acc-1' };
