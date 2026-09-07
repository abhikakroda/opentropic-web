import { Link } from 'react-router-dom';
import { ArrowRight, Smartphone, Sparkles, Workflow } from 'lucide-react';
import { landingFeatures, product } from '../data/catalog';

export function HomePage() {
  return (
    <main className="shell py-16">
      <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="mb-4 font-mono text-xs tracking-[0.18em] uppercase text-muted-foreground">
            React + TypeScript web app
          </p>
          <h1 className="max-w-xl text-[clamp(2.75rem,6vw,4.5rem)] leading-[0.95] font-bold">
            {product.tagline}
          </h1>
          <p className="mt-5 max-w-[46ch] text-lg leading-relaxed text-muted-foreground">
            {product.description}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/app" className="btn-solid">
              Open web app <ArrowRight size={16} />
            </Link>
            <Link to="/app/devices" className="btn-ghost">
              Pair Android companion
            </Link>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="border border-dashed border-border bg-card p-5">
            <div className="mb-3 font-mono text-xs tracking-widest uppercase text-muted-foreground">
              {product.domain}/app
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Sparkles size={16} className="text-scope" />
                <span className="font-medium">Web workspace</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Chats, skills, tasks, artifacts, and settings in one SPA.
              </p>
              <div className="flex items-center gap-3">
                <Smartphone size={16} className="text-scope" />
                <span className="font-medium">Android companion</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Separate app folder. Integrated by pairing.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-14 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {landingFeatures.map((feature) => (
          <div key={feature.title} className="border border-dashed border-border bg-card p-5">
            <h2 className="text-lg font-medium">{feature.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{feature.body}</p>
          </div>
        ))}
      </section>

      <section className="mt-14 grid gap-4 md:grid-cols-2">
        <div className="border border-dashed border-border bg-card p-6">
          <Workflow size={20} className="text-scope" />
          <h2 className="mt-4 text-2xl font-bold">This folder is the web app</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Built with React, TypeScript, Vite, Zustand, React Router, and Tailwind. Routes live under
            <code className="mx-1 border border-dashed border-border bg-muted px-1.5 py-0.5 font-mono text-xs">/app</code>
            and keep state in the browser.
          </p>
        </div>
        <div className="border border-dashed border-border bg-card p-6">
          <Smartphone size={20} className="text-scope" />
          <h2 className="mt-4 text-2xl font-bold">Android stays separate</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            The Android project remains in <code className="border border-dashed border-border bg-muted px-1.5 py-0.5 font-mono text-xs">app/</code>.
            The web app integrates with it through companion pairing, shared task vocabulary, and handoff flows.
          </p>
        </div>
      </section>
    </main>
  );
}
