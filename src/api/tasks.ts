import { supabase } from '@/lib/supabase';
import { rpc } from './rpc';
import { taskInputSchema, firstIssue, type TaskInput } from '@/domain/validation';
import type { TaskRow } from '@/types/database';
import { ValidationError } from './auth';

function parseTask(input: TaskInput): TaskInput {
  const parsed = taskInputSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(firstIssue(parsed.error));
  return parsed.data;
}

export const fetchTodayTasks = (): Promise<TaskRow[]> => rpc('today_tasks');

export async function fetchTask(id: string): Promise<TaskRow | null> {
  const { data, error } = await supabase.from('tasks').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function addTask(input: TaskInput): Promise<TaskRow> {
  const v = parseTask(input);
  const { data, error } = await supabase.from('tasks').insert(v).select().single();
  if (error) throw error;
  return data;
}

export async function updateTask(id: string, input: TaskInput): Promise<void> {
  const v = parseTask(input);
  const { error } = await supabase.from('tasks').update(v).eq('id', id);
  if (error) throw error;
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) throw error;
}

export const reorderTasks = (ids: string[]): Promise<void> => rpc('reorder_tasks', { p_ids: ids }).then(() => undefined);
export const completeTask = (id: string) => rpc('complete_task', { p_task_id: id });
export const uncompleteTask = (id: string): Promise<void> => rpc('uncomplete_task', { p_task_id: id }).then(() => undefined);
