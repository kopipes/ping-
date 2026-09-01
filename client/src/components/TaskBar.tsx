import { useEffect } from "react";
import { useChatStore, Task } from "../store/chat";
import { useAuthStore } from "../store/auth";
import { api } from "../lib/api";

export function TaskBar({ conversationId }: { conversationId: string }) {
  const tasks = useChatStore((s) => s.tasks[conversationId] || []);
  const loadTasks = useChatStore((s) => s.loadTasks);
  const receiveTask = useChatStore((s) => s.receiveTask);
  const removeTask = useChatStore((s) => s.removeTask);
  const myId = useAuthStore((s) => s.user?.id);

  useEffect(() => {
    loadTasks(conversationId);
  }, [conversationId, loadTasks]);

  if (tasks.length === 0) return null;

  const completeTask = async (task: Task) => {
    try {
      const updated = await api<Task>(`/api/tasks/${task.id}/done`, { method: "PATCH" });
      receiveTask(updated);
    } catch {}
  };

  const deleteTask = async (task: Task) => {
    try {
      await api(`/api/tasks/${task.id}`, { method: "DELETE" });
      removeTask(conversationId, task.id);
    } catch {}
  };

  return (
    <div className="shrink-0 mx-4 mt-2 rounded-xl border border-amber-200 bg-amber-50 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-100 border-b border-amber-200">
        <span className="text-amber-600 text-sm">📋</span>
        <span className="text-xs font-semibold text-amber-800 uppercase tracking-wide">
          Tasks ({tasks.length})
        </span>
      </div>
      <div className="divide-y divide-amber-100 max-h-40 overflow-y-auto">
        {tasks.map((task) => (
          <div key={task.id} className="flex items-start gap-2.5 px-3 py-2 group">
            {/* Checkbox */}
            <button
              onClick={() => completeTask(task)}
              className="shrink-0 w-5 h-5 mt-0.5 rounded border-2 border-amber-400 hover:border-green-500 hover:bg-green-50 transition flex items-center justify-center"
              title="Tandai selesai"
            >
              <span className="text-[10px] text-transparent group-hover:text-green-500">✓</span>
            </button>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-800 leading-snug break-words">{task.content}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Dibuat oleh {task.createdBy.name}
              </p>
            </div>

            {/* Delete (creator or admin can delete) */}
            {task.createdById === myId && (
              <button
                onClick={() => deleteTask(task)}
                className="shrink-0 opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-red-500 transition text-xs"
                title="Hapus task"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
