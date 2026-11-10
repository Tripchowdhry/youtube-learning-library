// Helpers for folders and categories that can sit inside each other, any number of levels deep.

export type TreeNode = { id: string; parent_id: string | null; name: string; share_token?: string | null };

// "Outer › Inner › This", for labels and search.
export function treePath(nodes: TreeNode[], id: string | null): string {
  const names: string[] = [];
  let current = nodes.find((n) => n.id === id);
  while (current) {
    names.unshift(current.name);
    const parentId: string | null = current.parent_id;
    current = nodes.find((n) => n.id === parentId);
  }
  return names.join(" › ");
}

// True when `id` is `ancestorId` itself or sits somewhere inside it.
export function isWithin(nodes: TreeNode[], id: string | null, ancestorId: string): boolean {
  let current = nodes.find((n) => n.id === id);
  while (current) {
    if (current.id === ancestorId) return true;
    const parentId: string | null = current.parent_id;
    current = nodes.find((n) => n.id === parentId);
  }
  return false;
}

// Every node in tree order, indented by depth, for the "Move to" menus.
export function treeOptions<T extends TreeNode>(childrenOf: (parentId: string | null) => T[]) {
  const out: { id: string; label: string }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const n of childrenOf(parentId)) {
      out.push({ id: n.id, label: `${"  ".repeat(depth)}${n.name}` });
      walk(n.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}
