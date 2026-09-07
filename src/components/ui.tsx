import type { ButtonHTMLAttributes, InputHTMLAttributes, PropsWithChildren } from 'react';
import { cn } from '../lib/cn';

export function Button({
  className,
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'outline' }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition active:scale-[0.98] disabled:opacity-50',
        variant === 'primary' && 'bg-foreground text-background',
        variant === 'ghost' && 'border border-dashed border-border bg-background text-foreground hover:border-foreground',
        variant === 'danger' && 'border border-dashed border-red-500/30 bg-red-500/10 text-red-400 hover:border-red-500/50',
        variant === 'outline' && 'border border-dashed border-border bg-transparent text-foreground hover:bg-muted',
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full border border-dashed border-border bg-background px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-scope',
        className,
      )}
      {...props}
    />
  );
}

export function Card({ className, children }: PropsWithChildren<{ className?: string }>) {
  return (
    <div className={cn('border border-dashed border-border bg-card', className)}>
      {children}
    </div>
  );
}

export function Pill({
  children,
  tone = 'neutral',
}: PropsWithChildren<{ tone?: 'neutral' | 'success' | 'warn' | 'danger' | 'info' }>) {
  return (
    <span
      className={cn(
        'inline-flex items-center border px-2.5 py-1 text-xs capitalize',
        tone === 'neutral' && 'border-border bg-muted text-muted-foreground',
        tone === 'success' && 'border-scope/30 bg-scope/10 text-scope',
        tone === 'warn' && 'border-amber-400/30 bg-amber-400/10 text-amber-300',
        tone === 'danger' && 'border-red-500/30 bg-red-500/10 text-red-400',
        tone === 'info' && 'border-sky-400/30 bg-sky-400/10 text-sky-300',
      )}
    >
      {children}
    </span>
  );
}

export function Badge({ children, tone = 'neutral' }: PropsWithChildren<{ tone?: 'neutral' | 'success' | 'warn' | 'danger' | 'info' }>) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 border px-2 py-0.5 text-[0.6875rem] font-mono uppercase tracking-widest',
        tone === 'neutral' && 'border-border bg-muted text-muted-foreground',
        tone === 'success' && 'border-scope/30 bg-scope/10 text-scope',
        tone === 'warn' && 'border-amber-400/30 bg-amber-400/10 text-amber-300',
        tone === 'danger' && 'border-red-500/30 bg-red-500/10 text-red-400',
        tone === 'info' && 'border-sky-400/30 bg-sky-400/10 text-sky-300',
      )}
    >
      {children}
    </span>
  );
}
