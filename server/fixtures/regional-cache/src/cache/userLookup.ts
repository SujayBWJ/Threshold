type User = { id: string; region: string; name: string };
const cache = new Map<string, User>();

export async function findUser(
  userId: string,
  region: string,
  load: () => Promise<User>,
) {
  const key = userId;
  const cached = cache.get(key);
  if (cached) return cached;
  const user = await load();
  cache.set(key, user);
  return user;
}
