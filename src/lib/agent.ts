import { product, runtimes } from '../data/catalog';
import type {
  ArtifactItem,
  ArtifactKind,
  RuntimeId,
  SkillItem,
  TaskItem,
  TaskStatus,
  WorkspaceMemory,
} from '../types/app';
import { createId } from './id';

export type AgentIntent =
  | 'research'
  | 'create-html'
  | 'automation'
  | 'meeting-prep'
  | 'draft-reply'
  | 'cross-channel-draft'
  | 'research-deliverable'
  | 'workspace-memory'
  | 'travel-planner'
  | 'widget-management'
  | 'remote-agent'
  | 'task-summary'
  | 'skill-help'
  | 'general';

export type AndroidChannel = 'whatsapp' | 'telegram' | 'slack' | 'sms' | 'widget' | 'phone' | 'generic';

export interface AndroidHandoffPlan {
  title: string;
  action: string;
  channel: AndroidChannel;
  payload: string;
  requiresPairing: boolean;
  steps: string[];
  skillId?: string;
}

export interface ArtifactDraft {
  mode: 'create' | 'edit';
  targetId?: string;
  name: string;
  kind: ArtifactKind;
  summary: string;
  content: string;
  editInstruction?: string;
}

export interface AgentRoute {
  intent: AgentIntent;
  skillId: string | null;
  skillName: string | null;
  confidence: number;
  reason: string;
  needsAndroid: boolean;
  androidPlan?: AndroidHandoffPlan;
  artifactDraft?: ArtifactDraft;
  artifactDrafts?: ArtifactDraft[];
  memoryUpdate?: WorkspaceMemory;
  createTaskSummary?: boolean;
}

export interface AgentContext {
  input: string;
  runtime: RuntimeId;
  pairedAndroid: boolean;
  pairCode: string | null;
  skills: SkillItem[];
  tasks: TaskItem[];
  artifacts: ArtifactItem[];
  memory?: WorkspaceMemory;
}

export interface AgentRunResult {
  reply: string;
  route: AgentRoute;
  artifactsToUpsert: ArtifactItem[];
  tasksToCreate: TaskItem[];
  memory?: WorkspaceMemory;
  meta: {
    skillId?: string;
    skillName?: string;
    intent: AgentIntent;
    artifactIds: string[];
    taskIds: string[];
    handoff?: AndroidHandoffPlan;
  };
}

function now() {
  return new Date().toISOString();
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 42) || 'draft';
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function findSkill(skills: SkillItem[], id: string) {
  return skills.find((skill) => skill.id === id) ?? null;
}

function enabledSkill(skills: SkillItem[], id: string) {
  const skill = findSkill(skills, id);
  return skill?.enabled ? skill : null;
}

function detectAndroidChannel(text: string): AndroidChannel {
  if (/whatsapp|wa\b/.test(text)) return 'whatsapp';
  if (/telegram|tg\b/.test(text)) return 'telegram';
  if (/slack/.test(text)) return 'slack';
  if (/\bsms\b|text message|imessage/.test(text)) return 'sms';
  if (/widget/.test(text)) return 'widget';
  if (/phone|call|companion|android/.test(text)) return 'phone';
  return 'generic';
}

function extractQuoted(text: string) {
  const match = text.match(/[“"]([^”"]+)[”"]/);
  return match?.[1]?.trim() ?? null;
}

function extractEditTarget(input: string, artifacts: ArtifactItem[]) {
  const lower = input.toLowerCase();
  const byName = artifacts.find((artifact) => lower.includes(artifact.name.toLowerCase()));
  if (byName) return byName;
  if (/this (page|artifact|note|draft)|latest artifact|last artifact/.test(lower)) {
    return artifacts[0] ?? null;
  }
  return null;
}

function buildResearchContent(topic: string) {
  return [
    `# Research brief: ${topic}`,
    '',
    '## Framing',
    `- Topic: ${topic}`,
    '- Goal: produce a source-aware working brief for the OpenTropic workspace.',
    '',
    '## Key angles',
    '1. Current state and constraints',
    '2. Options and tradeoffs',
    '3. Recommended next action',
    '',
    '## Working notes',
    '- Capture claims with confidence labels.',
    '- Separate verified facts from open questions.',
    '- Convert decisions into tasks or Android handoffs when phone-side work is required.',
    '',
    '## Next steps',
    '- Validate sources',
    '- Draft a deliverable artifact',
    '- Queue follow-up work in Tasks',
  ].join('\n');
}

function buildHtmlContent(title: string, body: string) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root { color-scheme: light dark; font-family: Inter, system-ui, sans-serif; }
      body { margin: 0; background: #0f1218; color: #f4f7fb; }
      main { max-width: 760px; margin: 0 auto; padding: 48px 24px; }
      h1 { letter-spacing: -0.04em; margin-bottom: 12px; }
      p, li { line-height: 1.7; color: #c7d0db; }
      .card { border: 1px dashed #334155; padding: 20px; margin-top: 24px; }
      .meta { font: 12px/1.4 ui-monospace, monospace; text-transform: uppercase; letter-spacing: 0.14em; color: #7dd3a7; }
    </style>
  </head>
  <body>
    <main>
      <div class="meta">OpenTropic artifact</div>
      <h1>${title}</h1>
      <p>${body}</p>
      <div class="card">
        <strong>Generated in the web workbench</strong>
        <p>Edit this page from Artifacts, or ask chat to revise layout, tone, or sections.</p>
      </div>
    </main>
  </body>
</html>`;
}

function buildMeetingContent(topic: string) {
  return [
    `# Meeting prep: ${topic}`,
    '',
    '## Agenda',
    '1. Context and goal',
    '2. Decisions needed',
    '3. Risks / blockers',
    '4. Follow-ups',
    '',
    '## Talking points',
    `- Lead with the outcome for “${topic}”.`,
    '- Keep asks concrete and time-bounded.',
    '- Capture owners before the meeting ends.',
    '',
    '## Follow-up cards',
    '- [ ] Send summary',
    '- [ ] Create tasks',
    '- [ ] Queue Android reminders if needed',
  ].join('\n');
}

function buildTravelContent(topic: string) {
  return [
    `# Travel plan: ${topic}`,
    '',
    '## Trip snapshot',
    `- Destination / theme: ${topic}`,
    '- Pace: balanced',
    '- Share format: HTML page + notes',
    '',
    '## Day flow',
    '### Day 1',
    '- Arrival / settle',
    '- Anchor activity',
    '- Dinner reservation window',
    '',
    '### Day 2',
    '- Primary landmark / experience',
    '- Flexible buffer',
    '- Evening wrap-up',
    '',
    '## Pack / share',
    '- Documents',
    '- Offline maps',
    '- Emergency contacts',
  ].join('\n');
}

function buildReplyDraft(input: string, channel: AndroidChannel) {
  const quoted = extractQuoted(input);
  const audience =
    channel === 'whatsapp' ? 'WhatsApp' : channel === 'sms' ? 'SMS' : 'message';
  const body =
    quoted ??
    'Thanks for the update — I reviewed this and can confirm next steps shortly. Let me know if timing changed.';
  return [
    `# Draft ${audience} reply`,
    '',
    body,
    '',
    '---',
    'Tone: clear, concise, ready for companion send confirmation.',
  ].join('\n');
}


function channelLabel(channel: AndroidChannel) {
  if (channel === 'whatsapp') return 'WhatsApp';
  if (channel === 'telegram') return 'Telegram';
  if (channel === 'slack') return 'Slack';
  if (channel === 'sms') return 'SMS';
  return 'message';
}

function buildCrossChannelDraft(input: string, channel: AndroidChannel) {
  const quoted = extractQuoted(input);
  const label = channelLabel(channel);
  const body =
    quoted ??
    'Quick update from OpenTropic: I drafted this in the web workspace and routed it to the right channel.';
  const sendGate =
    channel === 'whatsapp' || channel === 'sms'
      ? 'Send confirmation stays on the Android companion.'
      : 'Send through the connected channel after review.';
  return [
    `# Cross-channel draft · ${label}`,
    '',
    body,
    '',
    '---',
    `Channel: ${label}`,
    sendGate,
    'Web drafts only. No silent send from the browser.',
  ].join('\n');
}

function buildResearchPipeline(topic: string) {
  const brief = [
    `# Source brief · ${topic}`,
    '',
    '## Question',
    `What matters most about ${topic}?`,
    '',
    '## Sources to check',
    '- Primary docs / official pages',
    '- Recent commentary or changelog notes',
    '- Competing approaches / alternatives',
    '',
    '## Early takeaways',
    '- Capture constraints before drafting the outline.',
    '- Prefer concrete examples over vague claims.',
    '- Flag anything uncertain for follow-up.',
  ].join('\n');

  const outline = [
    `# Outline · ${topic}`,
    '',
    '1. Context and why this matters',
    '2. Source findings',
    '3. Tradeoffs / open questions',
    '4. Recommended next actions',
    '',
    'Ready for HTML deliverable generation.',
  ].join('\n');

  const html = buildHtmlContent(
    `${topic} deliverable`,
    `Pipeline: source brief → outline → HTML artifact → shareable summary for ${topic}.`,
  ).replace(
    '<div class="card">',
    '<div class="card"><p><strong>Shareable summary</strong></p><p>Key findings, open questions, and next actions packaged for review.</p>',
  );

  const summary = [
    `# Shareable summary · ${topic}`,
    '',
    '- Source brief captured',
    '- Outline approved for HTML generation',
    '- HTML artifact ready in Artifacts',
    '- Keep this summary for Slack/Telegram/WhatsApp drafts',
  ].join('\n');

  return { brief, outline, html, summary };
}

function maybeRememberFromInput(input: string, memory?: WorkspaceMemory): WorkspaceMemory | undefined {
  if (!memory?.enabled) return undefined;
  const remember = input.match(/remember (?:that )?(.+)/i);
  if (!remember) return undefined;
  const detail = remember[1].trim().replace(/[.!?]$/, '');
  if (!detail) return undefined;
  const lower = detail.toLowerCase();
  const kind = /prefer|like|hate|style/.test(lower)
    ? 'preference' as const
    : /project|repo|app/.test(lower)
      ? 'project' as const
      : /every|routine|morning|evening/.test(lower)
        ? 'routine' as const
        : 'preference' as const;
  return {
    ...memory,
    facts: [
      {
        id: createId('mem'),
        kind,
        label: detail.slice(0, 48),
        detail,
        updatedAt: now(),
      },
      ...memory.facts,
    ].slice(0, 20),
  };
}
function reviseContent(content: string, instruction: string) {
  const lower = instruction.toLowerCase();
  let next = content;

  if (/shorter|concise|tighten/.test(lower)) {
    next = next
      .split('\n')
      .filter((line, index, arr) => !(line.trim() === '' && arr[index - 1]?.trim() === ''))
      .slice(0, Math.max(12, Math.floor(arrLength(next) * 0.7)))
      .join('\n');
  }

  if (/mobile|responsive/.test(lower) && next.includes('<html')) {
    if (!next.includes('max-width: 760px')) {
      next = next.replace(
        '</style>',
        'main{padding:24px 16px;} img,video{max-width:100%;height:auto;}\n    </style>',
      );
    }
    next = next.replace(
      '<div class="card">',
      '<div class="card"><p><strong>Mobile pass:</strong> tightened spacing for smaller screens.</p>',
    );
  }

  if (/action items|todos|follow-?ups/.test(lower) && !/## Action items/.test(next)) {
    next += '\n\n## Action items\n- [ ] Confirm owners\n- [ ] Set due dates\n- [ ] Send summary';
  }

  if (/friendlier|warmer|casual/.test(lower)) {
    next = next.replace(/Recommended next action/g, 'Best next move');
    next = next.replace(/Working notes/g, 'Notes to keep handy');
  }

  const stamp = `\n\n<!-- edit: ${instruction.trim().slice(0, 120)} -->`;
  if (!next.includes(stamp.trim())) next += stamp;
  return next;
}

function arrLength(value: string) {
  return value.split('\n').length;
}

function artifactKindForIntent(intent: AgentIntent): ArtifactKind {
  if (intent === 'create-html' || intent === 'travel-planner' || intent === 'research-deliverable') return 'page';
  if (
    intent === 'research' ||
    intent === 'meeting-prep' ||
    intent === 'draft-reply' ||
    intent === 'cross-channel-draft' ||
    intent === 'workspace-memory'
  ) {
    return 'note';
  }
  return 'note';
}

function routeInput(ctx: AgentContext): AgentRoute {
  const text = ctx.input.toLowerCase().trim();
  const editTarget = extractEditTarget(ctx.input, ctx.artifacts);
  const wantsEdit = /edit|revise|improve|rewrite|update|make .* (shorter|mobile|friendlier)/.test(text);
  const wantsArtifact =
    /artifact|html|page|brief|itinerary|outline|draft a|generate|create|write|deliverable|pipeline/.test(text) ||
    wantsEdit;
  const wantsAndroid =
    /android|whatsapp|telegram|slack|sms|text message|widget|phone|companion|send (this|it|reply)/.test(text);
  const channel = detectAndroidChannel(text);
  const memoryUpdate = maybeRememberFromInput(ctx.input, ctx.memory);

  const candidates: Array<{ intent: AgentIntent; skillId: string | null; score: number; reason: string }> = [
    {
      intent: 'task-summary',
      skillId: null,
      score: /summarize|open tasks|task status|what.*(task|blocked)/.test(text) ? 0.92 : 0,
      reason: 'User asked about current tasks.',
    },
    {
      intent: 'skill-help',
      skillId: null,
      score: /which skills|skill.*(android|handoff)|enabled skills/.test(text) ? 0.9 : 0,
      reason: 'User asked which skills are available or support handoff.',
    },
    {
      intent: 'workspace-memory',
      skillId: 'workspace-memory',
      score: /workspace memory|what do you remember|remember that|forget that|memory facts|preferences you know/.test(text)
        ? 0.96
        : memoryUpdate
          ? 0.94
          : 0,
      reason: 'Workspace memory inspect/update requested.',
    },
    {
      intent: 'cross-channel-draft',
      skillId: 'cross-channel-draft',
      score: /cross[- ]channel|slack|telegram|whatsapp|draft.*(slack|telegram|whatsapp|reply|message)/.test(text)
        ? 0.95
        : 0,
      reason: 'Cross-channel messaging draft detected.',
    },
    {
      intent: 'research-deliverable',
      skillId: 'research-deliverable',
      score: /research.*(deliverable|pipeline|report)|source brief|outline.*html|one prompt.*(brief|outline|html|summary)|deliverable pipeline/.test(
        text,
      )
        ? 0.97
        : 0,
      reason: 'Research → deliverable pipeline requested.',
    },
    {
      intent: 'draft-reply',
      skillId: 'draft-reply',
      score:
        /reply|sms|message follow-?up|draft.*(reply|message)/.test(text) && !/slack|telegram|cross[- ]channel/.test(text)
          ? 0.9
          : 0,
      reason: 'Messaging / reply draft detected.',
    },
    {
      intent: 'widget-management',
      skillId: 'widget-management',
      score: /widget/.test(text) ? 0.95 : 0,
      reason: 'Android widget configuration requested.',
    },
    {
      intent: 'create-html',
      skillId: 'create-html',
      score:
        /html|landing page|web page|artifact page|generate page/.test(text)
          ? 0.9
          : wantsEdit && editTarget?.kind === 'page'
            ? 0.88
            : 0,
      reason: 'HTML / page artifact requested.',
    },
    {
      intent: 'research',
      skillId: 'research',
      score: /research|brief|sources|investigate|summarize .* about/.test(text) ? 0.88 : 0,
      reason: 'Research brief requested.',
    },
    {
      intent: 'meeting-prep',
      skillId: 'meeting-prep',
      score: /meeting|agenda|talking points/.test(text) ? 0.9 : 0,
      reason: 'Meeting prep requested.',
    },
    {
      intent: 'travel-planner',
      skillId: 'travel-planner',
      score: /travel|itinerary|trip plan|weekend getaway/.test(text) ? 0.91 : 0,
      reason: 'Travel planning requested.',
    },
    {
      intent: 'automation',
      skillId: 'automation',
      score: /automat|recurring|routine|every morning|schedule/.test(text) ? 0.86 : 0,
      reason: 'Automation / recurring routine requested.',
    },
    {
      intent: 'remote-agent',
      skillId: 'remote-agent',
      score: /claude code|codex|remote agent|ssh session/.test(text) ? 0.84 : 0,
      reason: 'Remote coding agent session referenced.',
    },
  ];

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0]?.score
    ? candidates[0]
    : {
        intent: 'general' as AgentIntent,
        skillId: null,
        score: 0.4,
        reason: 'No specialized skill matched; using general workspace assistant.',
      };

  let skill = best.skillId ? enabledSkill(ctx.skills, best.skillId) : null;
  let intent = best.intent;
  let reason = best.reason;
  let confidence = best.score;

  if (best.skillId && !skill) {
    reason = `${best.reason} Skill “${best.skillId}” is disabled, so falling back to general guidance.`;
    intent = wantsAndroid ? 'draft-reply' : wantsArtifact ? 'create-html' : 'general';
    confidence = Math.max(0.45, best.score - 0.25);
    skill = null;
  }

  const needsAndroid =
    wantsAndroid ||
    Boolean(
      skill?.androidHandoff &&
        (intent === 'draft-reply' ||
          intent === 'cross-channel-draft' ||
          intent === 'widget-management' ||
          intent === 'automation'),
    );

  let artifactDraft: ArtifactDraft | undefined;
  let artifactDrafts: ArtifactDraft[] | undefined;

  if (wantsEdit && editTarget) {
    artifactDraft = {
      mode: 'edit',
      targetId: editTarget.id,
      name: editTarget.name,
      kind: editTarget.kind,
      summary: `Revised from chat: ${ctx.input.slice(0, 80)}`,
      content: reviseContent(editTarget.content || editTarget.summary, ctx.input),
      editInstruction: ctx.input,
    };
  } else if (intent === 'research-deliverable') {
    const topicMatch = ctx.input
      .replace(/^(run|start|create|generate|draft|prepare)?\s*/i, '')
      .replace(/research\s*(→|->|to)?\s*deliverable( pipeline)?/i, '')
      .replace(/one prompt.*(brief|outline|html|summary)/i, '')
      .trim();
    const topic = titleCase(topicMatch.slice(0, 60)) || 'Research topic';
    const pipeline = buildResearchPipeline(topic);
    artifactDrafts = [
      {
        mode: 'create',
        name: `${slugify(topic)}-source-brief.md`,
        kind: 'note',
        summary: `Source brief for “${topic}”.`,
        content: pipeline.brief,
      },
      {
        mode: 'create',
        name: `${slugify(topic)}-outline.md`,
        kind: 'note',
        summary: `Outline for “${topic}”.`,
        content: pipeline.outline,
      },
      {
        mode: 'create',
        name: `${slugify(topic)}-deliverable.html`,
        kind: 'page',
        summary: `HTML deliverable for “${topic}”.`,
        content: pipeline.html,
      },
      {
        mode: 'create',
        name: `${slugify(topic)}-summary.md`,
        kind: 'note',
        summary: `Shareable summary for “${topic}”.`,
        content: pipeline.summary,
      },
    ];
    artifactDraft = artifactDrafts[2];
  } else if (
    intent === 'research' ||
    intent === 'create-html' ||
    intent === 'meeting-prep' ||
    intent === 'travel-planner' ||
    intent === 'draft-reply' ||
    intent === 'cross-channel-draft' ||
    (wantsArtifact && intent !== 'task-summary' && intent !== 'skill-help' && intent !== 'workspace-memory')
  ) {
    const topicMatch = ctx.input.replace(/^(draft|create|generate|write|make|prepare)\s+/i, '').trim();
    const topic = titleCase(topicMatch.slice(0, 60)) || 'Workspace draft';
    const kind = artifactKindForIntent(intent === 'general' ? 'create-html' : intent);
    let content = '';
    let name = '';
    let summary = '';

    if (intent === 'create-html' || (intent === 'general' && wantsArtifact)) {
      name = `${slugify(topic)}.html`;
      summary = `HTML page drafted for “${topic}”.`;
      content = buildHtmlContent(topic, `This page was drafted from: ${ctx.input}`);
    } else if (intent === 'research') {
      name = `${slugify(topic)}-brief.md`;
      summary = `Research brief for “${topic}”.`;
      content = buildResearchContent(topic);
    } else if (intent === 'meeting-prep') {
      name = `${slugify(topic)}-meeting.md`;
      summary = `Meeting prep card for “${topic}”.`;
      content = buildMeetingContent(topic);
    } else if (intent === 'travel-planner') {
      name = `${slugify(topic)}-itinerary.md`;
      summary = `Travel outline for “${topic}”.`;
      content = buildTravelContent(topic);
    } else if (intent === 'cross-channel-draft') {
      name = `${slugify(channel + '-cross-channel')}.md`;
      summary = `Cross-channel ${channelLabel(channel)} draft ready for review/send.`;
      content = buildCrossChannelDraft(ctx.input, channel);
    } else if (intent === 'draft-reply') {
      name = `${slugify(channel + '-reply')}.md`;
      summary = `Draft ${channelLabel(channel)} reply ready for review/send.`;
      content = buildReplyDraft(ctx.input, channel);
    }

    if (content) {
      artifactDraft = {
        mode: 'create',
        name,
        kind,
        summary,
        content,
      };
    }
  }

  let androidPlan: AndroidHandoffPlan | undefined;
  if (
    needsAndroid &&
    (intent === 'draft-reply' || intent === 'cross-channel-draft' || intent === 'widget-management' || wantsAndroid)
  ) {
    const messagingChannel =
      channel === 'slack' || channel === 'telegram' || channel === 'whatsapp' || channel === 'sms';
    const action =
      channel === 'whatsapp'
        ? 'Confirm WhatsApp send on Android'
        : channel === 'telegram'
          ? 'Send Telegram draft via connected channel / companion'
          : channel === 'slack'
            ? 'Send Slack draft via connected workspace channel'
            : channel === 'sms'
              ? 'Confirm SMS send on Android'
              : channel === 'widget'
                ? 'Apply widget configuration'
                : 'Run phone-side companion action';
    const payload =
      artifactDraft && (intent === 'draft-reply' || intent === 'cross-channel-draft')
        ? artifactDraft.content.replace(/^#.*\n+/, '').split('---')[0].trim()
        : ctx.input;
    androidPlan = {
      title:
        channel === 'widget'
          ? 'Configure Android widget'
          : messagingChannel
            ? `${channelLabel(channel)} draft send`
            : 'Android companion handoff',
      action,
      channel,
      payload,
      requiresPairing:
        !ctx.pairedAndroid &&
        (channel === 'whatsapp' ||
          channel === 'sms' ||
          channel === 'widget' ||
          channel === 'phone' ||
          channel === 'generic'),
      skillId: skill?.id,
      steps: ctx.pairedAndroid
        ? [
            'Review the drafted payload in web chat/artifacts.',
            channel === 'whatsapp' || channel === 'sms'
              ? 'Confirm send on the paired Android companion. Messaging confirmation stays on-device.'
              : 'Send through the connected channel after review.',
            'Mark the task done after confirmation.',
          ]
        : [
            'Open Devices and generate a pair code.',
            'Confirm the code in the separate OpenTropic Android app.',
            'Return here so blocked messaging/device tasks can move to queued.',
          ],
    };
  }

  return {
    intent,
    skillId: skill?.id ?? null,
    skillName: skill?.name ?? null,
    confidence,
    reason,
    needsAndroid: Boolean(androidPlan),
    androidPlan,
    artifactDraft,
    artifactDrafts,
    memoryUpdate,
    createTaskSummary: intent === 'task-summary',
  };
}

function summarizeTasks(tasks: TaskItem[]) {
  const open = tasks.filter((task) => task.status !== 'done');
  if (!open.length) return 'All tracked tasks are done.';
  return open
    .slice(0, 6)
    .map((task) => `- ${task.title} [${task.status}/${task.platform}] — ${task.summary}`)
    .join('\n');
}

function summarizeSkills(skills: SkillItem[]) {
  const enabled = skills.filter((skill) => skill.enabled);
  const handoff = enabled.filter((skill) => skill.androidHandoff);
  return [
    `Enabled skills (${enabled.length}): ${enabled.map((skill) => skill.name).join(', ') || 'none'}.`,
    `Android-handoff skills: ${handoff.map((skill) => skill.name).join(', ') || 'none'}.`,
  ].join('\n');
}

function summarizeMemory(memory?: WorkspaceMemory) {
  if (!memory?.enabled) return 'Workspace memory is off.';
  if (!memory.facts.length) return 'Workspace memory is on, but no facts are stored yet.';
  return memory.facts
    .slice(0, 5)
    .map((fact) => `- ${fact.label}: ${fact.detail}`)
    .join('\n');
}

export function runSkillRouter(ctx: AgentContext): AgentRunResult {
  const route = routeInput(ctx);
  const runtimeLabel = runtimes.find((item) => item.id === ctx.runtime)?.label ?? ctx.runtime;
  const createdAt = now();
  const artifactsToUpsert: ArtifactItem[] = [];
  const tasksToCreate: TaskItem[] = [];
  let memory = ctx.memory;

  const drafts = route.artifactDrafts?.length
    ? route.artifactDrafts
    : route.artifactDraft
      ? [route.artifactDraft]
      : [];

  for (const draft of drafts) {
    if (draft.mode === 'edit' && draft.targetId) {
      const existing = ctx.artifacts.find((item) => item.id === draft.targetId);
      if (existing) {
        artifactsToUpsert.push({
          ...existing,
          summary: draft.summary,
          content: draft.content,
          updatedAt: createdAt,
          revision: (existing.revision ?? 1) + 1,
        });
      }
    } else {
      artifactsToUpsert.push({
        id: createId('art'),
        name: draft.name,
        kind: draft.kind,
        summary: draft.summary,
        content: draft.content,
        createdAt,
        updatedAt: createdAt,
        revision: 1,
        sourceSkillId: route.skillId ?? undefined,
      });
    }
  }

  if (route.memoryUpdate) {
    memory = route.memoryUpdate;
  }

  if (route.androidPlan) {
    const status: TaskStatus = route.androidPlan.requiresPairing ? 'blocked' : 'queued';
    tasksToCreate.push({
      id: createId('task'),
      title: route.androidPlan.title,
      status,
      platform: 'android',
      summary: route.androidPlan.requiresPairing
        ? 'Blocked until Android companion is paired.'
        : 'Queued for companion confirmation/execution.',
      createdAt,
      updatedAt: createdAt,
      handoff: route.androidPlan,
    });
  } else if (route.intent === 'automation') {
    tasksToCreate.push({
      id: createId('task'),
      title: 'Set up recurring automation',
      status: 'queued',
      platform: 'shared',
      summary: 'Drafted from chat. Configure schedule and optional Android handoff next.',
      createdAt,
      updatedAt: createdAt,
    });
  } else if (route.intent === 'remote-agent') {
    tasksToCreate.push({
      id: createId('task'),
      title: 'Open remote agent session',
      status: 'queued',
      platform: 'desktop',
      summary: `Prepare a ${runtimeLabel} remote session from the web workspace.`,
      createdAt,
      updatedAt: createdAt,
    });
  } else if (route.intent === 'research-deliverable') {
    tasksToCreate.push({
      id: createId('task'),
      title: 'Research → deliverable pipeline',
      status: 'done',
      platform: 'desktop',
      summary: 'Source brief, outline, HTML artifact, and shareable summary created in one pass.',
      createdAt,
      updatedAt: createdAt,
    });
  }

  const artifactLine = artifactsToUpsert.length
    ? artifactsToUpsert
        .map((artifact) => `- ${artifact.name} (r${artifact.revision ?? 1}, ${artifact.kind})`)
        .join('\n')
    : null;

  const replyParts: string[] = [];
  replyParts.push(`Routed with ${runtimeLabel}.`);
  replyParts.push(
    route.skillName
      ? `Skill: ${route.skillName} (${Math.round(route.confidence * 100)}% match). ${route.reason}`
      : `No enabled specialty skill selected. ${route.reason}`,
  );

  if (route.intent === 'task-summary') {
    replyParts.push('Open tasks:');
    replyParts.push(summarizeTasks(ctx.tasks));
  } else if (route.intent === 'skill-help') {
    replyParts.push(summarizeSkills(ctx.skills));
  } else if (route.intent === 'workspace-memory' || /remember|memory|what do you know/.test(ctx.input.toLowerCase())) {
    replyParts.push('Workspace memory:');
    replyParts.push(summarizeMemory(memory ?? ctx.memory));
    if (route.memoryUpdate) {
      replyParts.push('Saved a lightweight fact from this chat. You can forget individual facts in Settings.');
    }
  } else if (route.intent === 'research-deliverable') {
    replyParts.push(
      'Research → deliverable pipeline complete: source brief → outline → HTML artifact → shareable summary.',
    );
  } else if (route.intent === 'cross-channel-draft') {
    replyParts.push(
      'Drafted in web for the selected channel. Messaging send confirmation stays on Android when the channel needs the phone.',
    );
  } else if (route.artifactDraft?.mode === 'edit') {
    replyParts.push(`Updated artifact “${route.artifactDraft.name}”. Open Artifacts to review the revision.`);
  } else if (artifactsToUpsert.length > 1) {
    replyParts.push(`Created ${artifactsToUpsert.length} artifacts. Open Artifacts to review the set.`);
  } else if (route.artifactDraft) {
    replyParts.push(`Created artifact “${route.artifactDraft.name}”. You can edit it from Artifacts or ask me to revise it.`);
  }

  if (route.androidPlan) {
    replyParts.push(
      route.androidPlan.requiresPairing
        ? `Android handoff planned for ${route.androidPlan.channel}, but the companion is not paired yet.`
        : `Android handoff queued for ${route.androidPlan.channel} on the paired companion.`,
    );
    replyParts.push(route.androidPlan.steps.map((step, index) => `${index + 1}. ${step}`).join('\n'));
    if (ctx.pairCode && route.androidPlan.requiresPairing) {
      replyParts.push(`Current pair code ready in Devices: ${ctx.pairCode}.`);
    }
  }

  if (artifactLine) {
    replyParts.push('Artifacts touched:');
    replyParts.push(artifactLine);
  }

  if (memory?.enabled && memory.facts.length && route.intent !== 'general') {
    const tip = memory.facts.find((fact) => fact.kind === 'preference') ?? memory.facts[0];
    if (tip) {
      replyParts.push(`Memory tip: ${tip.label} — ${tip.detail}`);
    }
  }

  if (route.intent === 'general' && !route.artifactDraft && !route.androidPlan) {
    replyParts.push(
      `I can research, draft HTML/notes, prepare meetings/travel plans, or queue Android handoffs while staying on ${product.domain}.`,
    );
  }

  return {
    reply: replyParts.join('\n\n'),
    route,
    artifactsToUpsert,
    tasksToCreate,
    memory,
    meta: {
      skillId: route.skillId ?? undefined,
      skillName: route.skillName ?? undefined,
      intent: route.intent,
      artifactIds: artifactsToUpsert.map((item) => item.id),
      taskIds: tasksToCreate.map((item) => item.id),
      handoff: route.androidPlan,
    },
  };
}

export function createArtifactFromPrompt(input: string, kind: ArtifactKind = 'page', skillId?: string): ArtifactItem {
  const createdAt = now();
  const topic = titleCase(input.replace(/^(create|generate|draft)\s+/i, '').slice(0, 60)) || 'New artifact';
  const content =
    kind === 'page'
      ? buildHtmlContent(topic, input)
      : kind === 'note'
        ? buildResearchContent(topic)
        : `# ${topic}\n\n${input}`;
  return {
    id: createId('art'),
    name: kind === 'page' ? `${slugify(topic)}.html` : `${slugify(topic)}.md`,
    kind,
    summary: `Created from Artifacts workbench: ${input.slice(0, 90)}`,
    content,
    createdAt,
    updatedAt: createdAt,
    revision: 1,
    sourceSkillId: skillId,
  };
}

export function editArtifactWithInstruction(artifact: ArtifactItem, instruction: string): ArtifactItem {
  const updatedAt = now();
  return {
    ...artifact,
    summary: `Edited: ${instruction.slice(0, 90)}`,
    content: reviseContent(artifact.content || artifact.summary, instruction),
    updatedAt,
    revision: (artifact.revision ?? 1) + 1,
  };
}
