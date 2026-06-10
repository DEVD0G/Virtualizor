export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ActionStep {
  capability: string;
  params: Record<string, any>;
  description: string;
  reversible: boolean;
}

export interface ActionPlan {
  intent: string;
  explanation: string;
  steps: ActionStep[];
  riskLevel: 'low' | 'medium' | 'high';
  warnings?: string[];
}

export interface StoredPlan extends ActionPlan {
  userId: string;
}

export interface ChatResponse {
  message: string;
  actionPlan?: ActionPlan;
  planId?: string;
}

export interface ExecuteResult {
  stepIndex: number;
  capability: string;
  success: boolean;
  taskId?: string;
  resourceId?: string;
  error?: string;
}

export type StreamEvent =
  | { type: 'text'; text: string }
  | { type: 'plan'; plan: ActionPlan; planId: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

export interface DiagnosticIssue {
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  suggestion?: string;
}

export interface DiagnosticsResult {
  summary: string;
  overallStatus: 'ok' | 'warning' | 'critical';
  issues: DiagnosticIssue[];
  recommendations: string[];
}
