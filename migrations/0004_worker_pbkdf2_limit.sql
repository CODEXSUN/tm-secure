UPDATE admin_accounts
SET password_hash = 'o2-7M7hCPLqnOd_0AODl09Zbz3--LwUE5PQE7sUN-NI',
    password_iterations = 100000,
    must_change_password = 1,
    updated_at = '2026-09-01T00:00:00.000Z'
WHERE id = '00000000-0000-4000-8000-000000000001'
  AND password_iterations = 310000;
