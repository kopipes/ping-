import { useEffect } from "react";
import { useChatStore, Task } from "../store/chat";
import { useAuthStore } from "../store/auth";
import { api, apiUrl } from "../lib/api";
import { useModal } from "./Modal";

const MAX_VISIBLE = 2;

export function TaskBar({
  conversationId,
  onShowAll,
}: {
  conversationId: string;
  onShowAll?: () => void;
}) {
  const tasks = useChatStore((s) => s.tasks[conversationId] || []);
  const loadTasks = useChatStore((s) => s.loadTasks);
  const receiveTask = useChatStore((s) => s.receiveTask);
  const removeTask = useChatStore((s) => s.removeTask);
  const myId = useAuthStore((s) => s.user?.id);
  const { prompt } = useModal();

  useEffect(() => {
    loadTasks(conversationId);
  }, [conversationId, loadTasks]);

  if (tasks.length === 0) return null;

  const visible = tasks.slice(0, MAX_VISIBLE);
  const overflow = tasks.length - MAX_VISIBLE;

  const completeTask = async (task: Task) => {
    const note = await prompt({
      title: "Selesaikan Task",
      message: `"${task.content}"`,
      placeholder: "Tulis catatan penyelesaian… (opsional)",
      confirmLabel: "Selesai",
    });
    if (note === null) return; // cancelled
    try {
      const updated = await api<Task>(`/api/tasks/${task.id}/done`, {
        method: "PATCH",
        body: { note: note.trim() || undefined },
      });
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
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-100 border-b border-amber-200">
        <span className="text-amber-600 text-sm">📋</span>
        <span className="text-xs font-semibold text-amber-800 uppercase tracking-wide flex-1">
          Tasks ({tasks.length})
        </span>
        {overflow > 0 && onShowAll && (
          <button
            onClick={onShowAll}
            className="text-xs text-amber-700 font-semibold hover:text-amber-900 underline underline-offset-2 transition"
          >
            +{overflow} lainnya →
          </button>
        )}
      </div>

      {/* Task rows — max 2 */}
      <div className="divide-y divide-amber-100">
        {visible.map((task) => (
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
              <p className="text-sm leading-snug break-words" style={{ color: "var(--sl-ink, #22221D)" }}>
                {task.content}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span className="text-xs text-gray-400">oleh {task.createdBy.name}</span>
                {task.assignee && (
                  <span className="flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 rounded-full px-1.5 py-0.5">
                    {task.assignee.avatarUrl
                      ? <img src={apiUrl(task.assignee.avatarUrl)} alt="" className="w-3.5 h-3.5 rounded-full object-cover" />
                      : <span className="w-3.5 h-3.5 rounded-full bg-amber-400 text-white flex items-center justify-center text-[8px] font-bold">{task.assignee.name.charAt(0)}</span>
                    }
                    {task.assignee.name}
                  </span>
                )}
              </div>
            </div>

            {/* Delete */}
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

      {/* "Lihat semua" footer when overflow */}
      {overflow > 0 && onShowAll && (
        <button
          onClick={onShowAll}
          className="w-full text-xs text-amber-700 font-semibold py-1.5 bg-amber-50 hover:bg-amber-100 transition border-t border-amber-200"
        >
          Lihat semua {tasks.length} task di tab Pin →
        </button>
      )}
    </div>
  );
}
