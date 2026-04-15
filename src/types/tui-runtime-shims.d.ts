declare module "@opentui/solid" {
  export namespace JSX {
    interface Element {}
    interface IntrinsicElements {
      box: any;
      text: any;
      b: any;
      span: any;
      scrollbox: any;
    }
  }

  export type SolidPlugin<Slots = Record<string, object>, Context = unknown> = {
    order?: number;
    slots?: Record<string, (ctx: Context, props: any) => JSX.Element | null>;
  };
}

declare module "@opentui/solid/jsx-runtime" {
  export namespace JSX {
    interface Element {}
    interface IntrinsicElements {
      box: any;
      text: any;
      b: any;
      span: any;
      scrollbox: any;
    }
  }

  export const jsx: any;
  export const jsxs: any;
  export const Fragment: any;
}

declare module "solid-js" {
  export function createSignal<T>(
    value: T,
  ): [() => T, (value: T | ((prev: T) => T)) => T];
  export function createEffect(fn: () => void): void;
  export function onCleanup(fn: () => void): void;
}

declare module "@opencode-ai/plugin/tui" {
  import type { JSX, SolidPlugin } from "@opentui/solid";

  export type TuiPluginApi = {
    state: {
      provider: ReadonlyArray<{ id: string }>;
      path: {
        worktree: string;
        directory: string;
      };
      session: {
        messages: (sessionID: string) => ReadonlyArray<any>;
      };
    };
    theme: {
      current: {
        text: unknown;
        textMuted: unknown;
      };
    };
    event: {
      on: (type: string, handler: (event: any) => void) => () => void;
    };
    slots: {
      register: (
        plugin: Omit<SolidPlugin<any, { theme: unknown }>, "id"> & {
          id?: never;
          order?: number;
          slots: Record<string, (ctx: any, props: any) => JSX.Element | null>;
        },
      ) => string;
    };
    lifecycle: {
      onDispose: (fn: () => void | Promise<void>) => () => void;
    };
    client: {
      config?: {
        providers?: () => Promise<{
          data?: {
            providers?: Array<{ id: string }>;
          };
        }>;
        get?: () => Promise<{
          data?: Record<string, unknown>;
        }>;
      };
      session?: {
        get?: (params: { path: { id: string } }) => Promise<{
          data?: {
            modelID?: string;
            providerID?: string;
          };
        }>;
      };
    };
  };

  export type TuiPluginMeta = {
    state: "first" | "updated" | "same";
    id: string;
    source: string;
    spec: string;
    target: string;
    requested?: string;
    version?: string;
    modified?: number;
    first_time: number;
    last_time: number;
    time_changed: number;
    load_count: number;
    fingerprint: string;
  };

  export type TuiPlugin = (
    api: TuiPluginApi,
    options: unknown,
    meta: TuiPluginMeta,
  ) => Promise<void>;

  export type TuiPluginModule = {
    id?: string;
    tui: TuiPlugin;
    server?: never;
  };
}
