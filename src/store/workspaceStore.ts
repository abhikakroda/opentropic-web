import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  seedArtifacts,
  seedDevices,
  seedMemory,
  seedProviders,
  seedSkills,
  seedTasks,
} from '../data/catalog';
import {
  createArtifactFromPrompt,
  editArtifactWithInstruction,
  runSkillRouter,
  type AndroidHandoffPlan,
} from '../lib/agent';
import { createId } from '../lib/id';
import type {
  ApiConfig,
  ArtifactKind,
  ChatMessage,
  Conversation,
  MemoryFact,
  RuntimeId,
  TaskPlatform,
  TaskStatus,
  WorkspaceSnapshot,
} from '../types/app';
import { providerPresets, streamApiChat } from '../lib/apiClient';
import type { ChatTurn } from '../lib/apiClient';

function createPairCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}

function now() {
  return new Date().toISOString();
}

function createSeedConversation(): {
  conversation: Conversation;
  messages: Record<string, ChatMessage>;
} {
  const conversationId = 'conv_welcome';
  const messageId = 'msg_welcome';
  return {
    conversation: {
      id: conversationId,
      title: 'Welcome',
      updatedAt: now(),
      messageIds: [messageId],
      pinned: true,
    },
    messages: {
      [messageId]: {
        id: messageId,
        role: 'assistant',
        content:
          'Welcome to the OpenTropic web app. Ask me to research, draft artifacts, summarize tasks, or plan an Android handoff. Skills route the work automatically.',
        createdAt: now(),
        runtime: 'built-in',
        intent: 'general',
      },
    },
  };
}

const seed = createSeedConversation();

// Non-serializable transient state kept outside the zustand store so it is
// never persisted. Tracks the in-flight streaming request so it can be aborted.
let activeAbortController: AbortController | null = null;

type WorkspaceActions = {
  sendMessage: (content: string) => void;
  createConversation: () => void;
  selectConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  setRuntime: (runtime: RuntimeId) => void;
  toggleSkill: (id: string) => void;
  toggleProvider: (id: string) => void;
  generatePairCode: () => void;
  confirmPairCode: (code: string) => { ok: boolean; error?: string };
  unpairAndroid: () => void;
  addTask: (title: string, platform?: TaskPlatform, targetDeviceId?: string | null) => void;
  enqueueAndroidHandoff: (input: {
    title: string;
    channel: AndroidHandoffPlan['channel'];
    payload: string;
    action?: string;
    skillId?: string;
  }) => string;
  simulateAndroidPickup: (id: string) => { ok: boolean; error?: string };
  reportAndroidResult: (
    id: string,
    result: 'done' | 'failed' | 'blocked',
    note?: string,
  ) => { ok: boolean; error?: string };
  runTaskOnDevice: (taskId: string, deviceId: string) => { ok: boolean; error?: string };
  toggleSystemDevice: (id: string) => void;
  cycleTaskStatus: (id: string) => void;
  createArtifact: (prompt: string, kind?: ArtifactKind) => string;
  editArtifact: (id: string, instruction: string) => { ok: boolean; error?: string };
  selectArtifact: (id: string | null) => void;
  updateArtifactContent: (id: string, content: string) => void;
  toggleSidebar: () => void;
  toggleMemory: () => void;
  forgetMemoryFact: (id: string) => void;
  rememberFact: (label: string, detail: string, kind?: MemoryFact['kind']) => void;
  saveApiConfig: (config: Partial<ApiConfig>) => void;
  clearApiConfig: () => void;
  sendMessageWithApi: (content: string) => Promise<void>;
  stopStreaming: () => void;
  retryLastMessage: () => Promise<void>;
  deleteConversation: (id: string) => void;
};

type WorkspaceStore = WorkspaceSnapshot & WorkspaceActions;

const initialState: WorkspaceSnapshot = {
  activeConversationId: seed.conversation.id,
  conversations: [seed.conversation],
  messagesById: seed.messages,
  tasks: seedTasks,
  skills: seedSkills,
  devices: seedDevices,
  artifacts: seedArtifacts,
  providers: seedProviders,
  selectedRuntime: 'built-in',
  memory: seedMemory,
  pairCode: null,
  pairedAndroid: false,
  theme: 'dark',
  sidebarCollapsed: false,
  selectedArtifactId: seedArtifacts[0]?.id ?? null,
  apiConfig: {
    provider: 'openai',
    apiKey: '',
    baseUrl: providerPresets[0].baseUrl,
    model: providerPresets[0].defaultModel,
    connected: false,
  },
};

export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      sendMessage: (content: string) => {
        const trimmed = content.trim();
        if (!trimmed) return;

        const state = get();
        const conversationId = state.activeConversationId;
        const userId = createId('msg');
        const assistantId = createId('msg');
        const createdAt = now();
        const agent = runSkillRouter({
          input: trimmed,
          runtime: state.selectedRuntime,
          pairedAndroid: state.pairedAndroid,
          pairCode: state.pairCode,
          skills: state.skills,
          tasks: state.tasks,
          artifacts: state.artifacts,
          memory: state.memory,
        });

        const userMessage: ChatMessage = {
          id: userId,
          role: 'user',
          content: trimmed,
          createdAt,
        };

        const assistantMessage: ChatMessage = {
          id: assistantId,
          role: 'assistant',
          content: agent.reply,
          createdAt: new Date(Date.now() + 1).toISOString(),
          runtime: state.selectedRuntime,
          skillId: agent.meta.skillId,
          skillName: agent.meta.skillName,
          intent: agent.meta.intent,
          artifactIds: agent.meta.artifactIds,
          taskIds: agent.meta.taskIds,
          handoff: agent.meta.handoff,
        };

        set((prev) => {
          const conversations = prev.conversations.map((conversation) =>
            conversation.id === conversationId
              ? {
                  ...conversation,
                  title:
                    conversation.title === 'Welcome' || conversation.title === 'New chat'
                      ? trimmed.slice(0, 42)
                      : conversation.title,
                  updatedAt: createdAt,
                  messageIds: [...conversation.messageIds, userId, assistantId],
                }
              : conversation,
          );

          const artifactMap = new Map(prev.artifacts.map((artifact) => [artifact.id, artifact]));
          for (const artifact of agent.artifactsToUpsert) {
            artifactMap.set(artifact.id, artifact);
          }
          const artifacts = Array.from(artifactMap.values()).sort((a, b) => {
            const left = Date.parse(b.updatedAt ?? b.createdAt);
            const right = Date.parse(a.updatedAt ?? a.createdAt);
            return left - right;
          });

          return {
            conversations,
            messagesById: {
              ...prev.messagesById,
              [userId]: userMessage,
              [assistantId]: assistantMessage,
            },
            artifacts,
            selectedArtifactId: agent.artifactsToUpsert[0]?.id ?? prev.selectedArtifactId ?? artifacts[0]?.id ?? null,
            tasks: [...agent.tasksToCreate, ...prev.tasks],
            memory: agent.memory ?? prev.memory,
          };
        });
      },

      createConversation: () => {
        const id = createId('conv');
        const createdAt = now();
        const welcomeId = createId('msg');
        set((prev) => ({
          activeConversationId: id,
          conversations: [
            {
              id,
              title: 'New chat',
              updatedAt: createdAt,
              messageIds: [welcomeId],
            },
            ...prev.conversations,
          ],
          messagesById: {
            ...prev.messagesById,
            [welcomeId]: {
              id: welcomeId,
              role: 'assistant',
              content: 'New web chat ready. Ask me to research, draft, organize tasks, or prepare an Android handoff.',
              createdAt,
              runtime: prev.selectedRuntime,
              intent: 'general',
            },
          },
        }));
      },

      selectConversation: (id) => set({ activeConversationId: id }),

      renameConversation: (id, title) =>
        set((prev) => ({
          conversations: prev.conversations.map((conversation) =>
            conversation.id === id ? { ...conversation, title: title.trim() || conversation.title } : conversation,
          ),
        })),

      setRuntime: (runtime) => set({ selectedRuntime: runtime }),

      toggleSkill: (id) =>
        set((prev) => ({
          skills: prev.skills.map((skill) =>
            skill.id === id ? { ...skill, enabled: !skill.enabled } : skill,
          ),
        })),

      toggleProvider: (id) =>
        set((prev) => ({
          providers: prev.providers.map((provider) =>
            provider.id === id ? { ...provider, connected: !provider.connected } : provider,
          ),
          pairedAndroid:
            id === 'android' ? !prev.providers.find((provider) => provider.id === 'android')?.connected : prev.pairedAndroid,
        })),

      generatePairCode: () => {
        const code = createPairCode();
        set((prev) => ({
          pairCode: code,
          pairedAndroid: false,
          devices: prev.devices.map((device) =>
            device.platform === 'android'
              ? {
                  ...device,
                  status: 'idle',
                  lastSync: 'Awaiting confirmation',
                  connected: false,
                  detail: 'Code ' + code,
                }
              : device,
          ),
          providers: prev.providers.map((provider) =>
            provider.id === 'android'
              ? { ...provider, connected: false, detail: `Code ${code}` }
              : provider,
          ),
        }));
      },

      confirmPairCode: (code) => {
        const expected = get().pairCode;
        if (!expected) return { ok: false, error: 'Generate a pair code first.' };
        if (code.trim().toUpperCase() !== expected) {
          return { ok: false, error: 'Code does not match.' };
        }

        set((prev) => ({
          pairedAndroid: true,
          devices: prev.devices.map((device) =>
            device.platform === 'android'
              ? {
                  ...device,
                  status: 'online',
                  lastSync: 'Just now',
                  connected: true,
                  detail: 'Companion online',
                }
              : device,
          ),
          providers: prev.providers.map((provider) =>
            provider.id === 'android'
              ? { ...provider, connected: true, detail: 'Companion online' }
              : provider,
          ),
          tasks: prev.tasks.map((task) =>
            task.status === 'blocked' && task.platform === 'android'
              ? {
                  ...task,
                  status: 'queued',
                  summary: 'Companion online. Ready for phone-side execution.',
                  updatedAt: now(),
                  handoff: task.handoff
                    ? { ...task.handoff, requiresPairing: false }
                    : task.handoff,
                }
              : task,
          ),
        }));

        return { ok: true };
      },

      unpairAndroid: () =>
        set((prev) => ({
          pairedAndroid: false,
          pairCode: null,
          devices: prev.devices.map((device) =>
            device.platform === 'android'
              ? {
                  ...device,
                  status: 'offline',
                  lastSync: 'Disconnected',
                  connected: false,
                  detail: 'Pair via code',
                }
              : device,
          ),
          providers: prev.providers.map((provider) =>
            provider.id === 'android'
              ? { ...provider, connected: false, detail: 'Pair via code' }
              : provider,
          ),
        })),

      addTask: (title, platform = 'shared', targetDeviceId = null) => {
        const createdAt = now();
        set((prev) => ({
          tasks: [
            {
              id: createId('task'),
              title: title.trim(),
              status: platform === 'android' && !prev.pairedAndroid ? 'blocked' : 'queued',
              platform,
              summary:
                platform === 'android'
                  ? prev.pairedAndroid
                    ? 'Queued for Android companion.'
                    : 'Blocked until Android is paired.'
                  : 'Created from the web app.',
              createdAt,
              updatedAt: createdAt,
              targetDeviceId:
                targetDeviceId ??
                (platform === 'android' ? 'device_android' : platform === 'desktop' ? 'device_web' : null),
              handoff:
                platform === 'android'
                  ? ({
                      title: title.trim(),
                      action: 'Run companion action',
                      channel: 'generic',
                      payload: title.trim(),
                      requiresPairing: !prev.pairedAndroid,
                      steps: prev.pairedAndroid
                        ? [
                            'Review the task payload.',
                            'Confirm execution in the Android companion.',
                            'Advance the task status when finished.',
                          ]
                        : [
                            'Generate a pair code in Devices.',
                            'Confirm the code in the Android app.',
                            'Return here to unblock the task.',
                          ],
                    } satisfies AndroidHandoffPlan)
                  : undefined,
            },
            ...prev.tasks,
          ],
        }));
      },

      enqueueAndroidHandoff: ({ title, channel, payload, action, skillId }) => {
        const createdAt = now();
        const id = createId('task');
        const paired = get().pairedAndroid;
        const plan: AndroidHandoffPlan = {
          title: title.trim(),
          action: action ?? ('Run ' + channel + ' companion action'),
          channel,
          payload: payload.trim(),
          requiresPairing: !paired,
          skillId,
          steps: paired
            ? [
                'Review the drafted payload in the handoff queue.',
                'Let the paired Android companion pick up the task.',
                'Confirm send/apply on the phone, then report the result back.',
              ]
            : [
                'Generate a pair code in Devices.',
                'Confirm the code in the separate OpenTropic Android app.',
                'Return here so the blocked handoff can move to queued.',
              ],
        };

        set((prev) => ({
          tasks: [
            {
              id,
              title: plan.title,
              status: paired ? 'queued' : 'blocked',
              platform: 'android',
              summary: paired
                ? 'Queued Android handoff for ' + channel + '.'
                : 'Blocked until Android companion is paired.',
              createdAt,
              updatedAt: createdAt,
              targetDeviceId: 'device_android',
              handoff: plan,
            },
            ...prev.tasks,
          ],
        }));

        return id;
      },

      simulateAndroidPickup: (id) => {
        const task = get().tasks.find((item) => item.id === id);
        if (!task) return { ok: false, error: 'Task not found.' };
        if (task.platform !== 'android' || !task.handoff) {
          return { ok: false, error: 'Only Android handoff tasks can be picked up.' };
        }
        if (!get().pairedAndroid || task.handoff.requiresPairing) {
          return { ok: false, error: 'Pair Android before the companion can pick this up.' };
        }
        if (task.status !== 'queued' && task.status !== 'blocked') {
          return { ok: false, error: 'Task is not waiting for pickup.' };
        }

        set((prev) => ({
          tasks: prev.tasks.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: 'running' as TaskStatus,
                  summary: 'Android companion running: ' + (item.handoff?.action ?? item.title),
                  updatedAt: now(),
                  targetDeviceId: 'device_android',
                }
              : item,
          ),
          devices: prev.devices.map((device) =>
            device.id === 'device_android'
              ? {
                  ...device,
                  status: 'online',
                  lastSync: 'Just now',
                  connected: true,
                  detail: 'Companion executing handoff',
                }
              : device,
          ),
        }));

        return { ok: true };
      },

      reportAndroidResult: (id, result, note) => {
        const task = get().tasks.find((item) => item.id === id);
        if (!task) return { ok: false, error: 'Task not found.' };
        if (task.platform !== 'android') return { ok: false, error: 'Not an Android task.' };

        const summary =
          result === 'done'
            ? 'Companion finished and reported success.'
            : result === 'failed'
              ? 'Companion reported failure.'
              : 'Companion blocked the handoff and needs attention.';

        set((prev) => ({
          tasks: prev.tasks.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: result,
                  summary,
                  resultNote: note?.trim() || item.resultNote,
                  updatedAt: now(),
                  handoff: item.handoff
                    ? { ...item.handoff, requiresPairing: false }
                    : item.handoff,
                }
              : item,
          ),
          devices: prev.devices.map((device) =>
            device.id === 'device_android'
              ? {
                  ...device,
                  status: result === 'failed' || result === 'blocked' ? 'idle' : 'online',
                  lastSync: 'Just now',
                  connected: true,
                  detail: summary,
                }
              : device,
          ),
        }));

        return { ok: true };
      },

      runTaskOnDevice: (taskId, deviceId) => {
        const state = get();
        const task = state.tasks.find((item) => item.id === taskId);
        const device = state.devices.find((item) => item.id === deviceId);
        if (!task) return { ok: false, error: 'Task not found.' };
        if (!device) return { ok: false, error: 'Device not found.' };

        if (device.platform === 'android') {
          if (!state.pairedAndroid) {
            return { ok: false, error: 'Pair Android before assigning phone work.' };
          }
          set((prev) => ({
            tasks: prev.tasks.map((item) =>
              item.id === taskId
                ? {
                    ...item,
                    platform: 'android' as TaskPlatform,
                    status:
                      item.status === 'done' || item.status === 'failed' ? 'queued' : item.status,
                    targetDeviceId: device.id,
                    summary: 'Assigned to ' + device.name + ' for companion execution.',
                    updatedAt: now(),
                    handoff: item.handoff ?? {
                      title: item.title,
                      action: 'Run companion action',
                      channel: 'generic',
                      payload: item.summary,
                      requiresPairing: false,
                      steps: [
                        'Review the task on web.',
                        'Confirm execution on Android.',
                        'Report the result back to the queue.',
                      ],
                    },
                  }
                : item,
            ),
          }));
          return { ok: true };
        }

        if (device.kind === 'system' && device.connected === false) {
          return { ok: false, error: 'Reconnect ' + device.name + ' before running tasks there.' };
        }

        if (device.status === 'offline') {
          return { ok: false, error: device.name + ' is offline.' };
        }

        set((prev) => ({
          tasks: prev.tasks.map((item) =>
            item.id === taskId
              ? {
                  ...item,
                  platform: 'desktop' as TaskPlatform,
                  status: 'running' as TaskStatus,
                  targetDeviceId: device.id,
                  assignedRuntime: prev.selectedRuntime,
                  summary:
                    'Running on ' +
                    device.name +
                    ' via ' +
                    (device.transport ? device.transport.toUpperCase() : 'local') +
                    '.',
                  updatedAt: now(),
                }
              : item,
          ),
          devices: prev.devices.map((item) =>
            item.id === deviceId
              ? {
                  ...item,
                  status: 'online',
                  lastSync: 'Just now',
                  detail: 'Running "' + task.title + '"',
                }
              : item,
          ),
        }));

        return { ok: true };
      },

      toggleSystemDevice: (id) =>
        set((prev) => ({
          devices: prev.devices.map((device) => {
            if (device.id !== id || device.platform === 'android' || device.kind === 'companion') {
              return device;
            }
            const connected = !(device.connected ?? device.status !== 'offline');
            return {
              ...device,
              connected,
              status: connected ? 'online' : 'offline',
              lastSync: connected ? 'Just now' : 'Disconnected',
              detail: connected
                ? device.transport === 'mcp'
                  ? 'MCP ops bridge ready'
                  : device.transport === 'ssh'
                    ? 'SSH bridge ready'
                    : 'Local workspace ready'
                : 'Reconnect to run tasks',
            };
          }),
        })),

      cycleTaskStatus: (id) =>
        set((prev) => ({
          tasks: prev.tasks.map((task) => {
            if (task.id !== id) return task;
            const order = ['queued', 'running', 'done', 'blocked', 'failed'] as const;
            const next = order[(order.indexOf(task.status) + 1) % order.length];
            return { ...task, status: next, updatedAt: now() };
          }),
        })),

      createArtifact: (prompt, kind = 'page') => {
        const artifact = createArtifactFromPrompt(prompt, kind);
        set((prev) => ({
          artifacts: [artifact, ...prev.artifacts],
          selectedArtifactId: artifact.id,
        }));
        return artifact.id;
      },

      editArtifact: (id, instruction) => {
        const trimmed = instruction.trim();
        if (!trimmed) return { ok: false, error: 'Add an edit instruction.' };
        const current = get().artifacts.find((artifact) => artifact.id === id);
        if (!current) return { ok: false, error: 'Artifact not found.' };
        if (current.kind === 'image') {
          return { ok: false, error: 'Image artifacts are placeholders in the web workbench.' };
        }

        const updated = editArtifactWithInstruction(current, trimmed);
        set((prev) => ({
          artifacts: prev.artifacts.map((artifact) => (artifact.id === id ? updated : artifact)),
          selectedArtifactId: id,
        }));
        return { ok: true };
      },

      selectArtifact: (id) => set({ selectedArtifactId: id }),

      updateArtifactContent: (id, content) =>
        set((prev) => ({
          artifacts: prev.artifacts.map((artifact) =>
            artifact.id === id
              ? {
                  ...artifact,
                  content,
                  updatedAt: now(),
                  revision: (artifact.revision ?? 1) + 1,
                  summary: artifact.summary.startsWith('Edited manually')
                    ? artifact.summary
                    : 'Edited manually in Artifacts workbench.',
                }
              : artifact,
          ),
        })),

      toggleSidebar: () => set((prev) => ({ sidebarCollapsed: !prev.sidebarCollapsed })),

      toggleMemory: () =>
        set((prev) => ({
          memory: {
            ...prev.memory,
            enabled: !prev.memory.enabled,
          },
        })),

      forgetMemoryFact: (id) =>
        set((prev) => ({
          memory: {
            ...prev.memory,
            facts: prev.memory.facts.filter((fact) => fact.id !== id),
          },
        })),

      rememberFact: (label, detail, kind = 'preference') => {
        const trimmedLabel = label.trim();
        const trimmedDetail = detail.trim();
        if (!trimmedLabel || !trimmedDetail) return;
        set((prev) => ({
          memory: {
            ...prev.memory,
            enabled: true,
            facts: [
              {
                id: createId('mem'),
                kind,
                label: trimmedLabel,
                detail: trimmedDetail,
                updatedAt: now(),
              },
            ...prev.memory.facts,
            ],
          },
        }));
      },

      saveApiConfig: (config) =>
        set((prev) => {
          const next = { ...prev.apiConfig, ...config };
          return {
            apiConfig: {
              ...next,
              connected: next.apiKey.trim().length > 0,
            },
          };
        }),

      clearApiConfig: () =>
        set((prev) => ({
          apiConfig: { ...prev.apiConfig, apiKey: '', connected: false },
        })),

      sendMessageWithApi: async (content: string) => {
        const trimmed = content.trim();
        if (!trimmed) return;

        const state = get();
        const config = state.apiConfig;
        const conversationId = state.activeConversationId;
        const conversation = state.conversations.find((item) => item.id === conversationId);
        const createdAt = now();
        const userId = createId('msg');
        const assistantId = createId('msg');

        const priorTurns: ChatTurn[] = (conversation?.messageIds ?? [])
          .map((id) => state.messagesById[id])
          .filter(Boolean)
          .filter((message) => message.role === 'user' || message.role === 'assistant')
          .slice(-12)
          .map((message) => ({
            role: message.role as 'user' | 'assistant',
            content: message.content,
          }));

        const memoryContext = state.memory.enabled && state.memory.facts.length
          ? '\n\nWorkspace memory:\n' +
            state.memory.facts.map((fact) => '- ' + fact.label + ': ' + fact.detail).join('\n')
          : '';

        const systemPrompt =
          'You are OpenTropic, an AI workspace assistant running in the web app. ' +
          'Be concise and helpful. You can help with research, drafting artifacts, organizing tasks, ' +
          'and planning Android companion handoffs. The Android app is a separate paired product. ' +
          'Format replies in Markdown. For any mathematical notation, ALWAYS use LaTeX: wrap inline ' +
          'math in single dollar signs like $E = mc^2$ and display equations in double dollar signs ' +
          'like $$\\text{FSPL (dB)} = 20\\log_{10}(d) + 20\\log_{10}(f) + 32.44$$. Do not write formulas ' +
          'as plain text.' +
          memoryContext;

        const turns: ChatTurn[] = [
          { role: 'system', content: systemPrompt },
          ...priorTurns,
          { role: 'user', content: trimmed },
        ];

        const userMessage: ChatMessage = {
          id: userId,
          role: 'user',
          content: trimmed,
          createdAt,
        };

        const pendingAssistant: ChatMessage = {
          id: assistantId,
          role: 'assistant',
          content: '',
          createdAt: new Date(Date.now() + 1).toISOString(),
          runtime: state.selectedRuntime,
          streaming: true,
          intent: 'general',
        };

        set((prev) => ({
          conversations: prev.conversations.map((item) =>
            item.id === conversationId
              ? {
                  ...item,
                  title:
                    item.title === 'Welcome' || item.title === 'New chat'
                      ? trimmed.slice(0, 42)
                      : item.title,
                  updatedAt: createdAt,
                  messageIds: [...item.messageIds, userId, assistantId],
                }
              : item,
          ),
          messagesById: {
            ...prev.messagesById,
            [userId]: userMessage,
            [assistantId]: pendingAssistant,
          },
        }));

        const controller = new AbortController();
        activeAbortController = controller;

        try {
          const reply = await streamApiChat(
            config,
            turns,
            (_delta, full) => {
              set((prev) => {
                const current = prev.messagesById[assistantId];
                if (!current) return {} as Partial<WorkspaceStore>;
                return {
                  messagesById: {
                    ...prev.messagesById,
                    [assistantId]: { ...current, content: full, streaming: true },
                  },
                };
              });
            },
            controller.signal,
          );

          set((prev) => {
            const current = prev.messagesById[assistantId];
            if (!current) return {} as Partial<WorkspaceStore>;
            return {
              messagesById: {
                ...prev.messagesById,
                [assistantId]: {
                  ...current,
                  content: reply.trim() || current.content.trim() || '(empty response)',
                  streaming: false,
                  skillName: config.model,
                },
              },
            };
          });
        } catch (error) {
          const aborted =
            (error instanceof DOMException && error.name === 'AbortError') ||
            (error instanceof Error && error.name === 'AbortError');
          set((prev) => {
            const current = prev.messagesById[assistantId];
            if (!current) return {} as Partial<WorkspaceStore>;
            if (aborted) {
              return {
                messagesById: {
                  ...prev.messagesById,
                  [assistantId]: {
                    ...current,
                    content: current.content.trim() ? current.content + '\n\n_(stopped)_' : '_(stopped)_',
                    streaming: false,
                    error: true,
                  },
                },
              };
            }
            const detail = error instanceof Error ? error.message : 'Request failed.';
            return {
              messagesById: {
                ...prev.messagesById,
                [assistantId]: {
                  ...current,
                  content:
                    'Could not reach the model. ' +
                    detail +
                    '\n\nCheck your API key, base URL, and model name in Settings, then retry.',
                  streaming: false,
                  error: true,
                  intent: 'general',
                },
              },
            };
          });
        } finally {
          if (activeAbortController === controller) {
            activeAbortController = null;
          }
        }
      },

      stopStreaming: () => {
        if (activeAbortController) {
          activeAbortController.abort();
          activeAbortController = null;
        }
      },

      retryLastMessage: async () => {
        const state = get();
        const conversation = state.conversations.find((item) => item.id === state.activeConversationId);
        if (!conversation) return;
        // Find the last user message and drop everything after it so we can regenerate.
        const ids = conversation.messageIds;
        let lastUserIndex = -1;
        for (let i = ids.length - 1; i >= 0; i -= 1) {
          if (state.messagesById[ids[i]]?.role === 'user') {
            lastUserIndex = i;
            break;
          }
        }
        if (lastUserIndex === -1) return;
        const lastUserId = ids[lastUserIndex];
        const lastUserContent = state.messagesById[lastUserId]?.content ?? '';
        const keepIds = ids.slice(0, lastUserIndex);
        const removed = ids.slice(lastUserIndex);

        set((prev) => {
          const nextMessages = { ...prev.messagesById };
          for (const id of removed) delete nextMessages[id];
          return {
            conversations: prev.conversations.map((item) =>
              item.id === conversation.id ? { ...item, messageIds: keepIds } : item,
            ),
            messagesById: nextMessages,
          };
        });

        if (get().apiConfig.connected) {
          await get().sendMessageWithApi(lastUserContent);
        } else {
          get().sendMessage(lastUserContent);
        }
      },

      deleteConversation: (id) =>
        set((prev) => {
          const remaining = prev.conversations.filter((item) => item.id !== id);
          const removed = prev.conversations.find((item) => item.id === id);
          const nextMessages = { ...prev.messagesById };
          if (removed) {
            for (const mid of removed.messageIds) delete nextMessages[mid];
          }
          const conversations = remaining.length ? remaining : [seed.conversation];
          const messagesById = remaining.length ? nextMessages : { ...seed.messages };
          const activeConversationId =
            prev.activeConversationId === id ? conversations[0].id : prev.activeConversationId;
          return { conversations, messagesById, activeConversationId };
        }),
    }),
    {
      name: 'opentropic.web.workspace.v5',
      partialize: (state) => ({
        activeConversationId: state.activeConversationId,
        conversations: state.conversations,
        messagesById: state.messagesById,
        tasks: state.tasks,
        skills: state.skills,
        devices: state.devices,
        artifacts: state.artifacts,
        providers: state.providers,
        selectedRuntime: state.selectedRuntime,
        memory: state.memory,
        pairCode: state.pairCode,
        pairedAndroid: state.pairedAndroid,
        theme: state.theme,
        sidebarCollapsed: state.sidebarCollapsed,
        selectedArtifactId: state.selectedArtifactId,
        apiConfig: state.apiConfig,
      }),
    },
  ),
);

export function useActiveMessages() {
  const activeConversationId = useWorkspaceStore((state) => state.activeConversationId);
  const conversations = useWorkspaceStore((state) => state.conversations);
  const messagesById = useWorkspaceStore((state) => state.messagesById);

  return useMemo(() => {
    const conversation = conversations.find((item) => item.id === activeConversationId);
    if (!conversation) return [] as ChatMessage[];
    return conversation.messageIds
      .map((id) => messagesById[id])
      .filter(Boolean) as ChatMessage[];
  }, [activeConversationId, conversations, messagesById]);
}
