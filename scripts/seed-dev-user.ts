/** Find the dev seed's auth user by email, paging through GoTrue's listUsers (50 per page by default). */
type ListUsers<U> = (params: { page: number; perPage: number }) => Promise<{ data: { users: U[]; nextPage?: number | null }; error: Error | null }>;

export async function findUserByEmail<U extends { email?: string }>(admin: { listUsers: ListUsers<U> }, email: string): Promise<U | undefined> {
  for (let page: number | null = 1; page !== null;) {
    const { data, error } = await admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((u) => u.email === email);
    if (found) return found;
    page = data.nextPage ?? null;
  }
  return undefined;
}
