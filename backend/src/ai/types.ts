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
