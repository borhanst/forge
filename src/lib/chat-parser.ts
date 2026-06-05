import type { TerminalLine, ChatMessage, ToolCallInfo, FileChangeInfo } from '../store'

const TOOL_PATTERNS = [
  { name: 'read',   re: /^(?:Viewing|Reading|Examining|Checking)\s+(?:file\s+)?(.+)/i },
  { name: 'edit',   re: /^(?:Editing|Writing|Updating|Modifying|Patching)\s+(?:file\s+)?(.+)/i },
  { name: 'create', re: /^(?:Creating|Writing new|Generating|Adding)\s+(?:file\s+)?(.+)/i },
  { name: 'bash',   re: /^(?:Running|Executing|Running command)\s+(.+)/i },
  { name: 'search', re: /^(?:Searching|Finding|Looking up)\s+(.+)/i },
  { name: 'read',   re: /^#\s*Viewing\s+(.+)/i },
  { name: 'edit',   re: /^#\s*Editing\s+(.+)/i },
  { name: 'create', re: /^#\s*Creating\s+(.+)/i },
  { name: 'bash',   re: /^#\s*Running\s+(.+)/i },
]

const FILE_CHANGE_PATTERNS = [
  { type: 'created' as const,  re: /^(?:Created|Created new|New file|Added)\s+(?:file\s+)?(.+)/i },
  { type: 'modified' as const, re: /^(?:Modified|Updated|Changed|Edited)\s+(?:file\s+)?(.+)/i },
  { type: 'deleted' as const,  re: /^(?:Deleted|Removed|Destroyed)\s+(?:file\s+)?(.+)/i },
]

function isDiffHeader(line: string): string | null {
  const m = line.match(/^(?:---\s+(?:a\/)?(.+)|[+]{3}\s+(?:b\/)?(.+))$/)
  return m ? (m[1] || m[2]).trim() : null
}

function isDiffHunk(line: string): boolean {
  return /^@@\s/.test(line)
}

function isDiffLine(line: string): boolean {
  return /^[+-]/.test(line) && !/^[+-]{3}\s/.test(line)
}

function isForgeSystemLine(line: string): boolean {
  return line.startsWith('[Forge]')
}

function detectToolCall(line: string): ToolCallInfo | null {
  for (const p of TOOL_PATTERNS) {
    const m = line.match(p.re)
    if (m) {
      return { name: p.name, args: m[1].trim(), status: 'running' }
    }
  }
  return null
}

function detectFileChange(line: string): FileChangeInfo | null {
  for (const p of FILE_CHANGE_PATTERNS) {
    const m = line.match(p.re)
    if (m) {
      return { path: m[1].trim(), type: p.type }
    }
  }
  return null
}

export interface CategorizeResult {
  toolCalls: ToolCallInfo[]
  fileChanges: FileChangeInfo[]
  textLines: string[]
  diffContent: string
}

export function categorizeLines(lines: TerminalLine[]): CategorizeResult {
  const toolCalls: ToolCallInfo[] = []
  const fileChanges: FileChangeInfo[] = []
  const textLines: string[] = []
  const diffParts: string[] = []

  for (const line of lines) {
    const text = line.content.trim()
    if (!text) continue
    if (isForgeSystemLine(text)) continue

    const dh = isDiffHeader(text)
    if (dh) {
      if (!fileChanges.some(f => f.path === dh)) {
        fileChanges.push({ path: dh, type: 'modified' })
      }
      diffParts.push(text)
      continue
    }

    if (isDiffHunk(text) || isDiffLine(text)) {
      diffParts.push(text)
      continue
    }

    const tool = detectToolCall(text)
    if (tool) {
      toolCalls.push(tool)
      continue
    }

    const fc = detectFileChange(text)
    if (fc) {
      if (!fileChanges.some(f => f.path === fc.path)) {
        fileChanges.push(fc)
      }
      continue
    }

    textLines.push(text)
  }

  return {
    toolCalls,
    fileChanges,
    textLines,
    diffContent: diffParts.join('\n'),
  }
}

export function buildChatMessages(
  prompt: string | null,
  outputLines: TerminalLine[],
): ChatMessage[] {
  const msgs: ChatMessage[] = []

  if (prompt) {
    msgs.push({
      id: `user-${Date.now()}`,
      role: 'user',
      content: prompt,
      toolCalls: [],
      fileChanges: [],
      timestamp: Date.now(),
    })
  }

  const { toolCalls, fileChanges, textLines, diffContent } = categorizeLines(outputLines)

  if (toolCalls.length > 0 || fileChanges.length > 0 || textLines.length > 0 || diffContent) {
    msgs.push({
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: textLines.join('\n'),
      toolCalls: toolCalls.map(t => ({ ...t, status: 'completed' as const })),
      fileChanges,
      diffContent: diffContent || undefined,
      timestamp: Date.now(),
    })
  }

  return msgs
}

let nextId = 0
export function generateId(): string {
  return `msg-${Date.now()}-${nextId++}`
}
