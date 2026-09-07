# OpenTropic Web App

React + TypeScript web app for [opentropic.tech](https://opentropic.tech).

This folder is separate from the Android app in `../app`.

## Stack

- React 19 + TypeScript
- Vite
- React Router
- Zustand (persisted workspace state)
- Tailwind CSS v4
- Framer Motion / Lucide

## App routes

- `/` marketing entry
- `/app` chat workspace
- `/app/tasks`
- `/app/skills`
- `/app/artifacts`
- `/app/devices` Android companion pairing
- `/app/settings`

## Workspace features

- Cmd/Ctrl+K search across chats, tasks, skills, artifacts, and devices
- Devices includes macOS / Windows / Linux system agents with SSH or MCP status
- Tasks can be assigned with Run on device
- Android handoff queue carries channel + payload and can move queued -> running -> done/blocked/failed

## Develop

```bash
cd web
npm install
npm run dev
```

## Build

```bash
cd web
npm run build
npm run preview
```

## Integration note

Android remains a separate product surface. The web app integrates through pairing codes, shared task/skill vocabulary, and handoff metadata. It does not replace the Android permission or automation layer.
