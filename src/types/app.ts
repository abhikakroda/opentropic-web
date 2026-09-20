import type { AgentIntent, AndroidHandoffPlan } from '../lib/agent';

export type PlatformId = 'macos' | 'windows' | 'linux' | 'android' | 'web';
export type RuntimeId = 'built-in' | 'claude' | 'codex' | 'opencode' | 'qwen' | 'hermes';
export type TaskStatus = 'queued' | 'running' | 'done' | 'blocked' | 'failed';
export type DeviceStatus = 'online' | 'idle' | 'offline';
export type MessageRole = 'user' | 'assistant' | 'system';
export type ThemeMode = 'dark' | 'light';
export type ArtifactKind = 'page' | 'note' | 'image' | 'slides' | 'other';
export type TaskPlatform = 'desktop' | 'android' | 'shared';
export type DeviceKind = 'browser' | 'companion' | 'system';
export type DeviceTransport = 'local' | 'pair-code' | 'ssh' | 'mcp';
export type HandoffChannel = 'whatsapp' | 'sms' | 'widget' | 'phone' | 'generic' | 'briefing';
export type SearchResultKind = 'chat' | 'task' | 'skill' | 'artifact' | 'device';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  runtime?: RuntimeId;
  streaming?: boolean;
  error?: boolean;
  skillId?: string;
  skillName?: string;
  intent?: AgentIntent;
  artifactIds?: string[];
  taskIds?: string[];
  handoff?: AndroidHandoffPlan;
}

export interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
  messageIds: string[];
  pinned?: boolean;
}

export interface TaskItem {
  id: string;
  title: string;
  status: TaskStatus;
  platform: TaskPlatform;
  summary: string;
  createdAt: string;
  updatedAt: string;
  handoff?: AndroidHandoffPlan;
  targetDeviceId?: string | null;
  assignedRuntime?: RuntimeId;
  resultNote?: string;
}

export interface SkillItem {
  id: string;
  name: string;
  category: string;
  description: string;
  enabled: boolean;
  androidHandoff: boolean;
}

export interface DeviceLink {
  id: string;
  name: string;
  platform: PlatformId;
  status: DeviceStatus;
  lastSync: string;
  kind?: DeviceKind;
  transport?: DeviceTransport;
  host?: string;
  capabilities?: string[];
  connected?: boolean;
  detail?: string;
}

export interface ArtifactItem {
  id: string;
  name: string;
  kind: ArtifactKind;
  summary: string;
  createdAt: string;
  updatedAt?: string;
  content?: string;
  revision?: number;
  sourceSkillId?: string;
}

export interface ProviderConnection {
  id: string;
  label: string;
  group: 'Models' | 'Runtimes' | 'Channels' | 'Systems' | 'Devices';
  connected: boolean;
  detail: string;
}

export interface MemoryFact {
  id: string;
  kind: 'preference' | 'project' | 'routine' | 'channel' | 'device';
  label: string;
  detail: string;
  updatedAt: string;
}

export interface WorkspaceMemory {
  facts: MemoryFact[];
  enabled: boolean;
}

export type ApiProviderId = 'openai' | 'openrouter' | 'groq' | 'together' | 'vercel' | 'custom';

export interface ApiConfig {
  provider: ApiProviderId;
  apiKey: string;
  baseUrl: string;
  model: string;
  connected: boolean;
}

export interface WorkspaceSearchHit {
  id: string;
  kind: SearchResultKind;
  title: string;
  subtitle: string;
  href: string;
  score: number;
}

export interface WorkspaceSnapshot {
  activeConversationId: string;
  conversations: Conversation[];
  messagesById: Record<string, ChatMessage>;
  tasks: TaskItem[];
  skills: SkillItem[];
  devices: DeviceLink[];
  artifacts: ArtifactItem[];
  providers: ProviderConnection[];
  selectedRuntime: RuntimeId;
  memory: WorkspaceMemory;
  pairCode: string | null;
  pairedAndroid: boolean;
  theme: ThemeMode;
  sidebarCollapsed: boolean;
  selectedArtifactId: string | null;
  apiConfig: ApiConfig;
}
