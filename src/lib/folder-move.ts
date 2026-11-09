// Where a dragged folder lands relative to the folder it is dropped on: just above it, just below it,
// or inside it as a subfolder.
export type DropWhere = "before" | "after" | "inside";

type Node = { id: string; parent_id: string | null; position: number };

// True when `id` is `rootId` or sits anywhere under it.
export function isInSubtree(items: Node[], id: string | null, rootId: string): boolean {
  let cur = id;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    if (cur === rootId) return true;
    seen.add(cur);
    cur = items.find((n) => n.id === cur)?.parent_id ?? null;
  }
  return false;
}

// Works out the new parent and order for a folder move. `siblingsOf` returns a parent's children in
// their current on-screen order. A null target means "to the top level, at the end". Returns only the
// folders whose parent or position changes, or null when the move isn't allowed (such as a folder
// dropped into itself or one of its own subfolders).
export function planFolderMove<T extends Node>(
  items: T[],
  siblingsOf: (parentId: string | null) => T[],
  draggedId: string,
  targetId: string | null,
  where: DropWhere,
): { id: string; parent_id: string | null; position: number }[] | null {
  const dragged = items.find((n) => n.id === draggedId);
  if (!dragged) return null;
  const target = targetId ? items.find((n) => n.id === targetId) : null;
  if (targetId && !target) return null;
  if (target && isInSubtree(items, target.id, dragged.id)) return null;

  const newParent = !target ? null : where === "inside" ? target.id : target.parent_id;
  const siblings = siblingsOf(newParent).filter((n) => n.id !== dragged.id);
  let index = siblings.length;
  if (target && where !== "inside") {
    index = siblings.findIndex((n) => n.id === target.id) + (where === "after" ? 1 : 0);
  }
  siblings.splice(index, 0, dragged);

  return siblings
    .map((n, position) => ({ id: n.id, parent_id: newParent, position }))
    .filter((c) => {
      const before = items.find((n) => n.id === c.id)!;
      return before.position !== c.position || before.parent_id !== c.parent_id;
    });
}
