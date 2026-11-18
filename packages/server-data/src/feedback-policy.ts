// Explicit user decision: feedback allowance resets at00:00 in Asia/Seoul.
export const feedbackPolicy = Object.freeze({
  dailyLimit: 5,
  timeZone: "Asia/Seoul",
});
// Read the real DB clock once, AFTER acquiring the session row lock. Bounds are
// explicit timestamptz values, independent of the connection's timezone.
export const feedbackWindowQuery = `
WITH observed AS MATERIALIZED (SELECT clock_timestamp() AS instant),
bounds AS (
 SELECT instant, date_trunc('day',instant,$1) AS starts_at,
 (date_trunc('day',instant AT TIME ZONE $1)+interval '1 day') AT TIME ZONE $1 AS resets_at
 FROM observed
)
SELECT instant,starts_at,resets_at,
 greatest(1,ceil(extract(epoch FROM resets_at-instant)))::integer AS retry_after
FROM bounds`;
