export function hasValidCronSecret(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const authorization = request.headers.get("authorization") ?? "";
  return authorization === cronSecret || authorization === `Bearer ${cronSecret}`;
}
