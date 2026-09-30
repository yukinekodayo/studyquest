import { rpc } from './rpc';

export const startSession = (taskId: string) => rpc('start_session', { p_task_id: taskId });
export const pauseSession = (id: string) => rpc('pause_session', { p_session_id: id });
export const resumeSession = (id: string) => rpc('resume_session', { p_session_id: id });
export const finishSession = (id: string, complete: boolean) =>
  rpc('finish_session', { p_session_id: id, p_complete: complete });
export const getSessionState = (taskId: string) => rpc('get_session_state', { p_task_id: taskId });
export const getActiveSession = () => rpc('get_active_session');
