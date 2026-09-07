import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { FileText, Image as ImageIcon, LayoutTemplate, Presentation } from 'lucide-react';
import type { ArtifactKind } from '../types/app';
import { useWorkspaceStore } from '../store/workspaceStore';
import { Button } from '../components/ui';

const icons = {
  page: LayoutTemplate,
  note: FileText,
  image: ImageIcon,
  slides: Presentation,
  other: FileText,
};

export function ArtifactsPage() {
  const artifacts = useWorkspaceStore((state) => state.artifacts);
  const selectedArtifactId = useWorkspaceStore((state) => state.selectedArtifactId);
  const createArtifact = useWorkspaceStore((state) => state.createArtifact);
  const editArtifact = useWorkspaceStore((state) => state.editArtifact);
  const selectArtifact = useWorkspaceStore((state) => state.selectArtifact);
  const updateArtifactContent = useWorkspaceStore((state) => state.updateArtifactContent);

  const [prompt, setPrompt] = useState('Weekly product update page for the team');
  const [kind, setKind] = useState<ArtifactKind>('page');
  const [instruction, setInstruction] = useState('Make this shorter and mobile friendly');
  const [error, setError] = useState('');

  const selected = useMemo(
    () => artifacts.find((artifact) => artifact.id === selectedArtifactId) ?? artifacts[0] ?? null,
    [artifacts, selectedArtifactId],
  );

  const onCreate = (event: FormEvent) => {
    event.preventDefault();
    if (!prompt.trim()) return;
    createArtifact(prompt, kind);
    setError('');
  };

  const onEdit = (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    const result = editArtifact(selected.id, instruction);
    if (!result.ok) {
      setError(result.error ?? 'Unable to edit artifact');
      return;
    }
    setError('');
  };

  return (
    <main className="shell py-16">
      <div className="mb-10">
        <p className="font-mono text-xs tracking-[0.18em] uppercase text-muted-foreground">Web app</p>
        <h1 className="mt-2 text-3xl font-bold">Artifacts</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Generate pages and notes, revise them with instructions, or edit content directly in the workbench.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="border border-dashed border-border bg-card p-4">
            <h2 className="font-mono text-xs tracking-widest uppercase text-muted-foreground">Generate</h2>
            <form onSubmit={onCreate} className="mt-4 space-y-3">
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={4}
                className="w-full border border-dashed border-border bg-background px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-scope"
                placeholder="Describe the artifact to create"
              />
              <select
                value={kind}
                onChange={(event) => setKind(event.target.value as ArtifactKind)}
                className="w-full border border-dashed border-border bg-background px-4 py-3 text-sm text-foreground outline-none"
              >
                <option value="page">HTML page</option>
                <option value="note">Markdown note</option>
                <option value="slides">Slides outline</option>
                <option value="other">Other</option>
              </select>
              <Button type="submit" className="w-full bg-foreground text-background hover:bg-muted">
                Create artifact
              </Button>
            </form>
          </div>

          <div className="border border-dashed border-border bg-card p-4">
            <h2 className="mb-3 font-mono text-xs tracking-widest uppercase text-muted-foreground">Library</h2>
            <div className="space-y-2">
              {artifacts.map((artifact) => {
                const Icon = icons[artifact.kind];
                const active = selected?.id === artifact.id;
                return (
                  <button
                    key={artifact.id}
                    type="button"
                    onClick={() => selectArtifact(artifact.id)}
                    className={`w-full border border-dashed px-3 py-3 text-left transition ${
                      active ? 'border-scope bg-scope/10' : 'border-border bg-background hover:border-foreground'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="border border-dashed border-border bg-muted p-2 text-scope">
                        <Icon size={16} />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{artifact.name}</div>
                        <div className="mt-1 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                          {artifact.kind} · r{artifact.revision ?? 1}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="border border-dashed border-border bg-card p-5">
          {selected ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-dashed border-border pb-4">
                <div>
                  <h2 className="text-2xl font-bold">{selected.name}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">{selected.summary}</p>
                  <div className="mt-3 flex flex-wrap gap-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                    <span>{selected.kind}</span>
                    <span>r{selected.revision ?? 1}</span>
                    <span>
                      {formatDistanceToNow(new Date(selected.updatedAt ?? selected.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              </div>

              <form onSubmit={onEdit} className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
                <input
                  value={instruction}
                  onChange={(event) => setInstruction(event.target.value)}
                  placeholder="Edit instruction, e.g. make this shorter and add action items"
                  className="border border-dashed border-border bg-background px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-scope"
                />
                <Button type="submit" className="bg-foreground text-background hover:bg-muted">
                  Apply edit
                </Button>
              </form>
              {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}

              <div className="mt-4">
                <label className="font-mono text-xs tracking-widest uppercase text-muted-foreground" htmlFor="artifact-content">
                  Content
                </label>
                <textarea
                  id="artifact-content"
                  value={selected.content ?? ''}
                  onChange={(event) => updateArtifactContent(selected.id, event.target.value)}
                  rows={22}
                  className="mt-3 w-full border border-dashed border-border bg-background px-4 py-3 font-mono text-xs leading-6 text-foreground outline-none focus:border-scope"
                />
              </div>

              {selected.kind === 'page' ? (
                <div className="mt-4 border border-dashed border-border bg-background p-4">
                  <div className="mb-3 font-mono text-xs tracking-widest uppercase text-muted-foreground">Preview</div>
                  <iframe
                    title={selected.name}
                    sandbox=""
                    srcDoc={selected.content ?? ''}
                    className="h-[420px] w-full border border-dashed border-border bg-white"
                  />
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Create an artifact to open the workbench.</p>
          )}
        </div>
      </div>
    </main>
  );
}
