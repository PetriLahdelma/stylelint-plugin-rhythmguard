import type { RhythmguardRuleOptions } from "./shared";

export interface StylelintRuleModule {
  messages: Record<string, unknown>;
  meta: {
    fixable?: boolean;
    url?: string;
    [key: string]: unknown;
  };
  ruleName: string;
  [key: string]: unknown;
}

declare const rule: StylelintRuleModule;

export const messages: StylelintRuleModule["messages"];
export const meta: StylelintRuleModule["meta"];
export const ruleName: string;
export type { RhythmguardRuleOptions };
export default rule;
