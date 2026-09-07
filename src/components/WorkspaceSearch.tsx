import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { searchWorkspace } from '../lib/search';
import { useWorkspaceStore } from '../store/workspaceStore';
import { cn } from '../lib/cn';

export function WorkspaceSearch() {
  const navigate = useNavigate();
  const conversations = useWorkspaceStore((state) => state.conversations);
  const messagesById = useWorkspaceStore((state) => state.messagesById);
  const tasks = useWorkspaceStore((state) => state.tasks);
  const skills = useWorkspaceStore((state) => state.skills);
  const artifacts = useWorkspaceStore((state) => state.artifacts);
  const devices = useWorkspaceStore((state) => state.devices);
  const selectConversation = useWorkspaceStore((state) => state.selectConversation);
  const selectArtifact = useWorkspaceStore((state) => state.selectArtifact);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const results = useMemo(
    () =>
      searchWorkspace({
        query,
        conversations,
        messagesById,
        tasks,
        skills,
        artifacts,
        devices,
      }),
    [query, conversations, messagesById, tasks, skills, artifacts, devices],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isPalette = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      if (isPalette) {
        event.preventDefault();
        setOpen((value) => !value);
        return;
      }
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const openHit = (index: number) => {
    const hit = results[index];
    if (!hit) return;
    if (hit.kind === 'chat') selectConversation(hit.id);
    if (hit.kind === 'artifact') selectArtifact(hit.id);
    navigate(hit.href);
    close();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden items-center gap-2 border border-dashed border-border bg-background px-3 py-2 text-xs text-muted-foreground transition hover:border-foreground md:inline-flex"
      >
        <Search size={14} />
        Search workspace
        <span className="font-mono text-[10px] tracking-widest uppercase">⌘K</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-background/70 px-4 py-24 backdrop-blur-sm">
          <div className="w-full max-w-2xl border border-dashed border-border bg-card shadow-2xl">
            <div className="flex items-center gap-3 border-b border-dashed border-border px-4 py-3">
              <Search size={16} className="text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    setActiveIndex((index) => Math.min(index + 1, Math.max(results.length - 1, 0)));
                  } else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setActiveIndex((index) => Math.max(index - 1, 0));
                  } else if (event.key === 'Enter') {
                    event.preventDefault();
                    openHit(activeIndex);
                  }
                }}
                placeholder="Search chats, tasks, skills, artifacts, devices…"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <button type="button" onClick={close} className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">
                Esc
              </button>
            </div>

            <div className="max-h-[420px] overflow-y-auto p-2">
              {!query.trim() ? (
                <p className="px-3 py-6 text-sm text-muted-foreground">
                  Type to search across the whole web workspace.
                </p>
              ) : results.length === 0 ? (
                <p className="px-3 py-6 text-sm text-muted-foreground">No matches for “{query.trim()}”.</p>
              ) : (
                results.map((hit, index) => (
                  <button
                    key={hit.kind + ':' + hit.id}
                    type="button"
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => openHit(index)}
                    className={cn(
                      'flex w-full items-start justify-between gap-3 border border-transparent px-3 py-3 text-left transition',
                      index === activeIndex ? 'border-dashed border-border bg-muted' : 'hover:bg-muted/60',
                    )}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{hit.title}</div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">{hit.subtitle}</div>
                    </div>
                    <span className="shrink-0 font-mono text-[10px] tracking-widest uppercase text-muted-foreground">
                      {hit.kind}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
