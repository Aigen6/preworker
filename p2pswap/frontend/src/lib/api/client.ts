// API 客户端，用于前端调用后端 API

const API_BASE = '/api'

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }
  
  const data = await response.json()
  if (!data.success) {
    throw new Error(data.error || 'Request failed')
  }
  
  return data.data || data
}

// 策略 API
export const strategiesAPI = {
  get: (chainId: number) => fetchAPI(`/strategies?chainId=${chainId}`),
  create: (strategy: any) => fetchAPI('/strategies', {
    method: 'POST',
    body: JSON.stringify(strategy),
  }),
  checkDelete: (strategyId: string) => fetchAPI(`/strategies/check?strategyId=${strategyId}`),
  delete: (strategyId: string) => fetchAPI(`/strategies?strategyId=${strategyId}`, {
    method: 'DELETE',
  }),
}

// 任务 API
export const tasksAPI = {
  get: (chainId: number, strategyId?: string) => {
    const params = new URLSearchParams({ chainId: chainId.toString() })
    if (strategyId) params.append('strategyId', strategyId)
    return fetchAPI(`/tasks?${params.toString()}`)
  },
  create: (tasks: any[]) => fetchAPI('/tasks', {
    method: 'POST',
    body: JSON.stringify({ tasks }),
  }),
  update: (taskId: string, updates: any) => fetchAPI('/tasks', {
    method: 'PATCH',
    body: JSON.stringify({ taskId, updates }),
  }),
  delete: (taskId: string) => fetchAPI(`/tasks?taskId=${taskId}`, {
    method: 'DELETE',
  }),
}

// 操作计划 API
export const plansAPI = {
  get: (strategyId: string) => fetchAPI(`/plans?strategyId=${strategyId}`),
  create: (plan: any, chainId: number, strategyId: string) => fetchAPI('/plans', {
    method: 'POST',
    body: JSON.stringify({ plan, chainId, strategyId }),
  }),
  delete: (strategyId: string) => fetchAPI(`/plans?strategyId=${strategyId}`, {
    method: 'DELETE',
  }),
}

// 任务链审核 API
export const taskChainReviewsAPI = {
  get: (chainId?: number, chainRootTaskId?: string) => {
    const params = new URLSearchParams()
    if (chainId) params.append('chainId', chainId.toString())
    if (chainRootTaskId) params.append('chainRootTaskId', chainRootTaskId)
    return fetchAPI(`/task-chain-reviews?${params.toString()}`)
  },
  approve: (chainRootTaskId: string, chainId: number, reviewedBy?: string) => fetchAPI('/task-chain-reviews', {
    method: 'POST',
    body: JSON.stringify({ chainRootTaskId, chainId, reviewedBy }),
  }),
  delete: (chainRootTaskId: string) => fetchAPI(`/task-chain-reviews?chainRootTaskId=${chainRootTaskId}`, {
    method: 'DELETE',
  }),
  isApproved: async (chainRootTaskId: string): Promise<boolean> => {
    const result = await fetchAPI<{ approved: boolean; review?: any }>(`/task-chain-reviews?chainRootTaskId=${chainRootTaskId}`)
    return result.approved || false
  },
}
