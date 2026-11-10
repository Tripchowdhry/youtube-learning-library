"use client";

import { Link2, Tag } from "lucide-react";
import { NavItem } from "@/components/ReadingLibrary";
import type { TreeNode } from "@/lib/category-tree";

// The category list in the sidebar of Reading, Tutorials, ScrapBook and Vault: categories inside
// categories, any number of levels deep, with arrows to open and close them, like the Videos folders.
export default function CategoryTree<C extends TreeNode>(props: {
  parentId: string | null;
  depth?: number;
  childrenOf: (parentId: string | null) => C[];
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  activeId: string | null;
  count: (id: string) => number;
  onOpen: (id: string) => void;
  dropOn: (category: C) => (() => void) | undefined;
  onDragStart?: (id: string) => void;
  onDragEnd: () => void;
  onMenu: (category: C, e: React.MouseEvent) => void;
}) {
  const depth = props.depth ?? 0;
  return (
    <>
      {props.childrenOf(props.parentId).map((cat) => {
        const hasChildren = props.childrenOf(cat.id).length > 0;
        const isOpen = !props.collapsed.has(cat.id);
        return (
          <div key={cat.id}>
            <div className="flex items-center" style={{ paddingLeft: depth * 14 }}>
              <button
                onClick={() => props.onToggle(cat.id)}
                className={`w-9 shrink-0 text-4xl leading-none ${hasChildren ? "" : "invisible"}`}
                aria-label={isOpen ? "Collapse" : "Expand"}
              >
                {isOpen ? "▾" : "▸"}
              </button>
              <div className="min-w-0 flex-1">
                <NavItem
                  icon={cat.share_token ? Link2 : Tag}
                  tone={cat.share_token ? "sky" : "orange"}
                  label={cat.name}
                  count={props.count(cat.id)}
                  active={props.activeId === cat.id}
                  onClick={() => props.onOpen(cat.id)}
                  onDropArticle={props.dropOn(cat)}
                  onDragStart={props.onDragStart ? () => props.onDragStart!(cat.id) : undefined}
                  onDragEnd={props.onDragEnd}
                  onContextMenu={(e) => props.onMenu(cat, e)}
                />
              </div>
            </div>
            {hasChildren && isOpen && <CategoryTree {...props} parentId={cat.id} depth={depth + 1} />}
          </div>
        );
      })}
    </>
  );
}
