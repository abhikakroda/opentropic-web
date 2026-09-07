import { useWorkspaceStore } from '../store/workspaceStore';

export function SkillsPage() {
  const skills = useWorkspaceStore((state) => state.skills);
  const toggleSkill = useWorkspaceStore((state) => state.toggleSkill);

  return (
    <main className="shell py-16">
      <div className="mb-10">
        <p className="font-mono text-xs tracking-[0.18em] uppercase text-muted-foreground">Web app</p>
        <h1 className="mt-2 text-3xl font-bold">Skills</h1>
        <p className="mt-2 text-sm text-muted-foreground">Enable skills for the browser workspace. Anything marked Android handoff stays ready for companion execution.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {skills.map((skill) => (
          <div key={skill.id} className="border border-dashed border-border bg-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-medium">{skill.name}</h2>
                <p className="mt-1 font-mono text-xs uppercase tracking-wide text-muted-foreground">{skill.category}</p>
              </div>
              <span className={`font-mono text-xs uppercase tracking-widest ${skill.enabled ? 'text-scope' : 'text-muted-foreground'}`}>
                {skill.enabled ? 'enabled' : 'off'}
              </span>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{skill.description}</p>
            <div className="mt-4 flex items-center justify-between gap-3">
              <span className={`font-mono text-xs uppercase tracking-widest ${skill.androidHandoff ? 'text-scope' : 'text-muted-foreground'}`}>
                {skill.androidHandoff ? 'android handoff' : 'web only'}
              </span>
              <button
                type="button"
                onClick={() => toggleSkill(skill.id)}
                className="border-b border-dashed border-border py-2 font-mono text-xs tracking-widest uppercase transition hover:border-foreground"
              >
                {skill.enabled ? 'Disable' : 'Enable'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
