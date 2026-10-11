type PrioritizedTask = { done: number | boolean; recurring?: boolean };

export function prioritizeTasks<T extends PrioritizedTask>(tasks: readonly T[]): T[] {
  const rank = (task: T) => (task.done ? 2 : 0) + (task.recurring ? 0 : 1);
  return tasks
    .map((task, index) => ({ task, index }))
    .sort((a, b) => rank(a.task) - rank(b.task) || a.index - b.index)
    .map(({ task }) => task);
}
