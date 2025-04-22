# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Build/Development Commands

- `deno task start` - Start development server with watch mode
- `deno task check` - Run formatting check, linting and type checking
- `deno task build` - Build the project
- `deno task preview` - Preview the built project

## Code Style Guidelines

- Prefer Preact hooks and signals for state management (`useSignal`,
  `useEffect`)
- TypeScript types for all function parameters and signals
- Use TSX for UI components
- Utilize `islands/` directory for interactive client-side components
- Employ async/await for promises rather than .then() chains where possible
- Use camelCase for variables and PascalCase for components
- Handle errors with try/catch blocks with appropriate logging
- Organize WebRTC signaling logic separately from rendering
- Leverage Deno standard libraries from imports ($std/)
- Format imports with preact first, followed by $fresh, then $std
