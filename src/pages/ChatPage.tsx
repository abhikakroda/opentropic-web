import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, Bot, RefreshCw, SendHorizontal, Sparkles, Square, User } from 'lucide-react';
import { Link } from 'react-router-dom';
import { runtimes } from '../data/catalog';
import { cn } from '../lib/cn';
import type { ChatMessage } from '../types/app';
import { useActiveMessages, useWorkspaceStore } from '../store/workspaceStore';
import { Markdown } from '../components/Markdown';

const suggestions = [
  'Summarize my open tasks',
  'Draft a launch note for a local-first AI workspace',
  'Explain the difference between streaming and batch LLM responses',
  'What do you remember about my workspace?',
  'Write a short product tagline for OpenTropic',
  'Give me three ideas to improve this chat UI',
];

function Cursor() {
  return (
    <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-[2px] animate-pulse bg-scope align-middle" />
  );
}

function MessageRow({
  message,
  isLast,
  onRetry,
}: {
  message: ChatMessage;
  isLast: boolean;
  onRetry: () => void;
}) {
  const isUser = message.role === 'user';
  const showCursor = !isUser && message.streaming;
  const hasContent = message.content.trim().length > 0;
  const empty = !isUser && message.streaming && !hasContent;
  // A finished assistant message with no content would render an empty box; skip it.
  if (!isUser && !message.streaming && !hasContent && !message.error) {
    return null;
  }

  return (
    <div className={cn('flex w-full gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-full border',
          isUser
            ? 'border-scope/30 bg-scope/10 text-scope'
            : message.error
              ? 'border-red-500/40 bg-red-500/10 text-red-500'
              : 'border-border bg-card text-muted-foreground',
        )}
      >
        {isUser ? <User size={15} /> : message.error ? <AlertTriangle size={15} /> : <Bot size={15} />}
      </div>

      <div className={cn('flex max-w-[78%] flex-col gap-1', isUser ? 'items-end' : 'items-start')}>
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <span>{isUser ? 'You' : message.skillName ?? message.runtime ?? 'built-in'}</span>
          <span>{format(new Date(message.createdAt), 'HH:mm')}</span>
        </div>

        <div
          className={cn(
            'rounded-2xl border px-4 py-2.5 text-sm leading-6',
            isUser
              ? 'rounded-br-sm border-scope/20 bg-scope/10 text-foreground'
              : message.error
                ? 'rounded-bl-sm border-red-500/30 bg-red-500/5 text-foreground'
                : 'rounded-bl-sm border-border bg-card text-foreground',
          )}
        >
          {empty ? (
            <span className="flex items-center gap-1.5 py-0.5">
              <span className="size-1.5 rounded-full bg-muted-foreground/70 [animation:pulse_1.2s_ease-in-out_infinite]" />
              <span className="size-1.5 rounded-full bg-muted-foreground/70 [animation:pulse_1.2s_ease-in-out_0.2s_infinite]" />
              <span className="size-1.5 rounded-full bg-muted-foreground/70 [animation:pulse_1.2s_ease-in-out_0.4s_infinite]" />
            </span>
          ) : (
            isUser || message.error ? (
              <p className="whitespace-pre-wrap break-words">
                {message.content}
                {showCursor ? <Cursor /> : null}
              </p>
            ) : (
              <div className="text-sm">
                <Markdown text={message.content} />
                {showCursor ? <Cursor /> : null}
              </div>
            )
          )}
        </div>

        {message.error && isLast ? (
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-scope transition hover:opacity-70"
          >
            <RefreshCw size={11} /> Retry
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function ChatPage() {
  const conversations = useWorkspaceStore((state) => state.conversations);
  const activeConversationId = useWorkspaceStore((state) => state.activeConversationId);
  const selectedRuntime = useWorkspaceStore((state) => state.selectedRuntime);
  const sendMessage = useWorkspaceStore((state) => state.sendMessage);
  const sendMessageWithApi = useWorkspaceStore((state) => state.sendMessageWithApi);
  const stopStreaming = useWorkspaceStore((state) => state.stopStreaming);
  const retryLastMessage = useWorkspaceStore((state) => state.retryLastMessage);
  const apiConfig = useWorkspaceStore((state) => state.apiConfig);
  const createConversation = useWorkspaceStore((state) => state.createConversation);
  const selectConversation = useWorkspaceStore((state) => state.selectConversation);
  const deleteConversation = useWorkspaceStore((state) => state.deleteConversation);
  const setRuntime = useWorkspaceStore((state) => state.setRuntime);
  const messages = useActiveMessages();
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId),
    [conversations, activeConversationId],
  );

  const streaming = useMemo(() => messages.some((message) => message.streaming), [messages]);
  const isEmpty = messages.length <= 1;

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinking]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
  }, [draft]);

  const submit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || streaming || thinking) return;
    setDraft('');
    if (apiConfig.connected) {
      void sendMessageWithApi(trimmed);
    } else {
      setThinking(true);
      sendMessage(trimmed);
      window.setTimeout(() => setThinking(false), 260);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit(draft);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit(draft);
    }
  };

  const busy = streaming || thinking;

  return (
    <main className="shell flex h-[calc(100vh-4rem)] flex-col py-4">
      <div className="flex min-h-0 flex-1 gap-4">
        {/* Conversations rail */}
        <aside className="hidden w-56 shrink-0 flex-col border border-border bg-card lg:flex">
          <div className="flex items-center justify-between border-b border-border px-3 py-3">
            <h2 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Chats</h2>
            <button
              type="button"
              onClick={createConversation}
              className="font-mono text-[10px] tracking-widest text-scope transition hover:opacity-70"
            >
              + New
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={cn(
                  'group flex items-center gap-1 border border-transparent px-3 py-2.5 transition hover:bg-muted',
                  conversation.id === activeConversationId && 'border-border bg-muted',
                )}
              >
                <button
                  type="button"
                  onClick={() => selectConversation(conversation.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="truncate text-sm font-medium">{conversation.title}</div>
                  <div className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {format(new Date(conversation.updatedAt), 'MMM d · HH:mm')}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => deleteConversation(conversation.id)}
                  className="shrink-0 rounded px-1 font-mono text-[10px] text-muted-foreground opacity-0 transition hover:text-red-500 group-hover:opacity-100"
                  aria-label="Delete chat"
                  title="Delete chat"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </aside>

        {/* Chat column */}
        <section className="flex min-h-0 flex-1 flex-col border border-border bg-background">
          <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
            <div className="flex items-center gap-3">
              <div className="flex size-8 items-center justify-center rounded-full border border-scope/30 bg-scope/10 text-scope">
                <Sparkles size={15} />
              </div>
              <div>
                <div className="text-sm font-semibold leading-tight">{activeConversation?.title ?? 'Chat'}</div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {apiConfig.connected ? (
                    <span className="text-scope">live · {apiConfig.model}</span>
                  ) : (
                    <Link to="/app/settings" className="transition hover:text-foreground">
                      demo mode · add API key
                    </Link>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {runtimes.map((runtime) => (
                <button
                  key={runtime.id}
                  type="button"
                  onClick={() => setRuntime(runtime.id)}
                  title={runtime.detail}
                  className={cn(
                    'border px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest transition',
                    selectedRuntime === runtime.id
                      ? 'border-scope bg-scope/10 text-foreground'
                      : 'border-border bg-card text-muted-foreground hover:border-foreground',
                  )}
                >
                  {runtime.label}
                </button>
              ))}
            </div>
          </header>

          <div ref={scrollRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-6">
            {isEmpty ? (
              <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
                <div className="flex size-14 items-center justify-center rounded-full border border-scope/30 bg-scope/10 text-scope">
                  <Bot size={26} />
                </div>
                <div className="max-w-md space-y-2">
                  <h1 className="text-xl font-bold">How can I help?</h1>
                  <p className="text-sm text-muted-foreground">
                    {apiConfig.connected
                      ? 'Ask anything. Responses stream in live from your connected model and stay saved on this device.'
                      : 'Add an API key in Settings to chat with a real model, or try a prompt to see the built-in demo.'}
                  </p>
                </div>
                <div className="flex max-w-xl flex-wrap justify-center gap-2">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => submit(suggestion)}
                      className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition hover:border-scope hover:text-foreground"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message, index) => (
                <MessageRow
                  key={message.id}
                  message={message}
                  isLast={index === messages.length - 1}
                  onRetry={() => void retryLastMessage()}
                />
              ))
            )}
          </div>

          <form onSubmit={onSubmit} className="border-t border-border px-5 py-4">
            <div className="flex items-end gap-2 rounded-2xl border border-border bg-card px-3 py-2 transition focus-within:border-scope">
              <textarea
                ref={textareaRef}
                rows={1}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Message OpenTropic…  (Enter to send, Shift+Enter for newline)"
                className="max-h-44 flex-1 resize-none bg-transparent py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              {busy && apiConfig.connected ? (
                <button
                  type="button"
                  onClick={stopStreaming}
                  className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-foreground transition hover:border-red-500 hover:text-red-500"
                  aria-label="Stop"
                  title="Stop generating"
                >
                  <Square size={15} />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!draft.trim() || busy}
                  className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-scope text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Send"
                >
                  <SendHorizontal size={16} />
                </button>
              )}
            </div>
            <p className="mt-2 px-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {apiConfig.connected
                ? 'Live · streaming · saved on this device'
                : 'Demo mode · saved on this device'}
            </p>
          </form>
        </section>
      </div>
    </main>
  );
}
