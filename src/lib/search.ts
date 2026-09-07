import type {
  ArtifactItem,
  Conversation,
  ChatMessage,
  DeviceLink,
  SkillItem,
  TaskItem,
  WorkspaceSearchHit,
} from '../types/app';

export interface WorkspaceSearchInput {
  query: string;
  conversations: Conversation[];
  messagesById: Record<string, ChatMessage>;
  tasks: TaskItem[];
  skills: SkillItem[];
  artifacts: ArtifactItem[];
  devices: DeviceLink[];
}

function scoreText(query: string, ...parts: Array<string | undefined | null>) {
  const haystack = parts.filter(Boolean).join(' ').toLowerCase();
  if (!haystack) return 0;
  if (haystack.includes(query)) return query.length / Math.max(haystack.length, query.length) + 1;
  const tokens = query.split(/\s+/).filter(Boolean);
  if (!tokens.length) return 0;
  const hits = tokens.filter((token) => haystack.includes(token)).length;
  return hits === 0 ? 0 : hits / tokens.length;
}

export function searchWorkspace(input: WorkspaceSearchInput): WorkspaceSearchHit[] {
  const query = input.query.trim().toLowerCase();
  if (!query) return [];

  const hits: WorkspaceSearchHit[] = [];

  for (const conversation of input.conversations) {
    const preview = conversation.messageIds
      .map((id) => input.messagesById[id]?.content)
      .filter(Boolean)
      .slice(-2)
      .join(' ');
    const score = scoreText(query, conversation.title, preview);
    if (score > 0) {
      hits.push({
        id: conversation.id,
        kind: 'chat',
        title: conversation.title,
        subtitle: preview.slice(0, 110) || 'Conversation',
        href: '/app',
        score,
      });
    }
  }

  for (const task of input.tasks) {
    const score = scoreText(
      query,
      task.title,
      task.summary,
      task.platform,
      task.status,
      task.handoff?.channel,
      task.handoff?.payload,
      task.resultNote,
    );
    if (score > 0) {
      hits.push({
        id: task.id,
        kind: 'task',
        title: task.title,
        subtitle: [task.status, task.platform, task.handoff?.channel].filter(Boolean).join(' · '),
        href: '/app/tasks',
        score,
      });
    }
  }

  for (const skill of input.skills) {
    const score = scoreText(query, skill.name, skill.category, skill.description, skill.androidHandoff ? 'android handoff' : 'web only');
    if (score > 0) {
      hits.push({
        id: skill.id,
        kind: 'skill',
        title: skill.name,
        subtitle: skill.category + ' · ' + (skill.enabled ? 'enabled' : 'off'),
        href: '/app/skills',
        score,
      });
    }
  }

  for (const artifact of input.artifacts) {
    const score = scoreText(query, artifact.name, artifact.kind, artifact.summary, artifact.content);
    if (score > 0) {
      hits.push({
        id: artifact.id,
        kind: 'artifact',
        title: artifact.name,
        subtitle: artifact.kind + ' · ' + artifact.summary,
        href: '/app/artifacts',
        score,
      });
    }
  }

  for (const device of input.devices) {
    const score = scoreText(
      query,
      device.name,
      device.platform,
      device.status,
      device.host,
      device.detail,
      device.kind,
      device.transport,
      ...(device.capabilities ?? []),
    );
    if (score > 0) {
      hits.push({
        id: device.id,
        kind: 'device',
        title: device.name,
        subtitle: [device.platform, device.status, device.host].filter(Boolean).join(' · '),
        href: '/app/devices',
        score,
      });
    }
  }

  return hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, 24);
}
