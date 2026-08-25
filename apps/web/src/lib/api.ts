export type Group = {
  id: string
  name: string
}

export type Item = {
  id: string
  title: string
  completedVolume: number
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok)
    throw new Error(`${init?.method ?? 'GET'} ${path} failed: ${res.status}`)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

// The initial API (docs/discussions/20260823-purpose-and-initial-tech-stack/proposal.md) has no
// single-resource GET for an item, only list endpoints plus PATCH/DELETE by id. The item edit page
// fetches the parent list and picks the matching entry out of it. Groups gained a single-resource
// GET in 0010-item-groups.

export const api = {
  listGroups: () => apiFetch<Group[]>('/api/groups'),
  getGroup: (groupId: string) => apiFetch<Group>(`/api/groups/${groupId}`),
  createGroup: (name: string) =>
    apiFetch<Group>('/api/groups', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  updateGroup: (groupId: string, name: string) =>
    apiFetch<Group>(`/api/groups/${groupId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),
  deleteGroup: (groupId: string) =>
    apiFetch<void>(`/api/groups/${groupId}`, { method: 'DELETE' }),

  listItems: (groupId: string) =>
    apiFetch<Item[]>(`/api/groups/${groupId}/items`),
  createItem: (groupId: string, title: string, completedVolume: number) =>
    apiFetch<Item>(`/api/groups/${groupId}/items`, {
      method: 'POST',
      body: JSON.stringify({ title, completedVolume }),
    }),
  updateItem: (
    groupId: string,
    itemId: string,
    title: string,
    completedVolume: number,
  ) =>
    apiFetch<Item>(`/api/groups/${groupId}/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title, completedVolume }),
    }),
  deleteItem: (groupId: string, itemId: string) =>
    apiFetch<void>(`/api/groups/${groupId}/items/${itemId}`, {
      method: 'DELETE',
    }),
}
