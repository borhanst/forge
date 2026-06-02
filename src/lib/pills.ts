/**
 * Shared model + agent option lists for the prompt input pills and the
 * right-panel "Forge" tab. Previously duplicated in RightPanel.tsx and
 * Sidebar.tsx.
 */

export interface PillOption {
  value: string
  label: string
}

export const OPENCODE_MODELS: PillOption[] = [
  { value: '',                       label: 'Default model' },
  { value: 'anthropic/claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  { value: 'anthropic/claude-4-20250514',       label: 'Claude 4' },
  { value: 'openai/gpt-5',                      label: 'GPT-5' },
  { value: 'openai/gpt-4o',                     label: 'GPT-4o' },
  { value: 'openai/gpt-4o-mini',                label: 'GPT-4o mini' },
  { value: 'openai/o3',                         label: 'o3' },
  { value: 'google/gemini-2.5-pro',             label: 'Gemini 2.5 Pro' },
  { value: 'google/gemini-2.5-flash',           label: 'Gemini 2.5 Flash' },
  { value: 'deepseek/deepseek-chat',            label: 'DeepSeek Chat' },
  { value: 'opencode/deepseek-v4-flash-free',   label: 'DeepSeek V4 Flash Free' },
  { value: '__custom__',                        label: 'Custom…' },
]

export const OPENCODE_AGENTS: PillOption[] = [
  { value: '',          label: 'Default (coding)' },
  { value: 'plan',      label: 'Plan' },
  { value: 'build',     label: 'Build' },
  { value: '__custom__', label: 'Custom…' },
]

export const CLAUDE_MODELS: PillOption[] = [
  { value: '',                  label: 'Default model' },
  { value: 'claude-opus-4-5',   label: 'Claude Opus 4.5' },
  { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
  { value: 'claude-haiku-4-5',  label: 'Claude Haiku 4.5' },
  { value: '__custom__',        label: 'Custom…' },
]

export const CODEX_MODELS: PillOption[] = [
  { value: '',          label: 'Default model' },
  { value: 'o4-mini',   label: 'o4-mini' },
  { value: 'o3',        label: 'o3' },
  { value: 'gpt-4o',    label: 'GPT-4o' },
  { value: '__custom__', label: 'Custom…' },
]

export const GEMINI_MODELS: PillOption[] = [
  { value: '',                  label: 'Default model' },
  { value: 'gemini-2.5-pro',    label: 'Gemini 2.5 Pro' },
  { value: 'gemini-2.5-flash',  label: 'Gemini 2.5 Flash' },
  { value: 'gemini-2.0-flash',  label: 'Gemini 2.0 Flash' },
  { value: '__custom__',        label: 'Custom…' },
]

export const OPENCLAUDE_MODELS: PillOption[] = [
  { value: '',          label: 'Default model' },
  { value: '__custom__', label: 'Custom (Ollama model)…' },
]

export const KILO_MODELS: PillOption[] = [
  { value: '',                                  label: 'Default model' },
  { value: 'kilo/kilo-auto/free',               label: 'Auto — Free (recommended)' },
  { value: 'kilo/kilo-auto/balanced',           label: 'Auto — Balanced' },
  { value: 'kilo/kilo-auto/frontier',           label: 'Auto — Frontier' },
  { value: 'kilo/kilo-auto/small',              label: 'Auto — Small' },
  { value: 'kilo/anthropic/claude-sonnet-4.5',  label: 'Claude Sonnet 4.5' },
  { value: 'kilo/anthropic/claude-opus-4.5',    label: 'Claude Opus 4.5' },
  { value: 'kilo/anthropic/claude-haiku-4.5',   label: 'Claude Haiku 4.5' },
  { value: 'kilo/~anthropic/claude-sonnet-latest', label: 'Claude Sonnet (latest)' },
  { value: 'kilo/~google/gemini-pro-latest',    label: 'Gemini Pro (latest)' },
  { value: 'kilo/~google/gemini-flash-latest',  label: 'Gemini Flash (latest)' },
  { value: 'kilo/~openai/gpt-latest',           label: 'GPT (latest)' },
  { value: 'kilo/deepseek/deepseek-chat',       label: 'DeepSeek Chat' },
  { value: '__custom__',                        label: 'Custom… (provider/model)' },
]

export const PROVIDER_MODELS: Record<string, PillOption[]> = {
  opencode:   OPENCODE_MODELS,
  claude:     CLAUDE_MODELS,
  codex:      CODEX_MODELS,
  gemini:     GEMINI_MODELS,
  openclaude: OPENCLAUDE_MODELS,
  kilo:       KILO_MODELS,
}

/**
 * Get a friendly short label for a model value (used in the pill chip when
 * collapsed — e.g. "gpt-5" instead of the full path).
 */
export function shortModelLabel(value: string | undefined, provider: string): string {
  if (!value) {
    const opts = PROVIDER_MODELS[provider] ?? OPENCODE_MODELS
    return opts[0]?.label ?? 'Default model'
  }
  const opts = PROVIDER_MODELS[provider] ?? OPENCODE_MODELS
  const found = opts.find(o => o.value === value)
  if (found) return found.label
  // Custom value: take the last path segment.
  const last = value.split('/').pop() ?? value
  return last
}

export function shortAgentLabel(value: string | undefined): string {
  if (!value) return 'Build'
  const found = OPENCODE_AGENTS.find(a => a.value === value)
  if (found) return found.label
  return value
}
