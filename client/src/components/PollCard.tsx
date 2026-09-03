import { useState } from "react";
import { useAuthStore } from "../store/auth";
import { api, apiUrl } from "../lib/api";

export interface PollData {
  id: string;
  conversationId: string;
  question: string;
  isMultiVote: boolean;
  isClosed: boolean;
  closedAt: string | null;
  createdAt: string;
  createdBy: { id: string; name: string; avatarUrl: string | null };
  totalVotes: number;
  myVotes: string[]; // optionIds I voted for
  options: {
    id: string;
    text: string | null;
    imageUrl: string | null;
    order: number;
    voteCount: number;
    voters: string[];
  }[];
}

export function PollCard({
  poll: initialPoll,
  onUpdate,
  onDelete,
  isAdminish,
}: {
  poll: PollData;
  onUpdate?: (poll: PollData) => void;
  onDelete?: (pollId: string) => void;
  isAdminish?: boolean;
}) {
  const myId = useAuthStore((s) => s.user?.id);
  const [poll, setPoll] = useState<PollData>(initialPoll);
  const [voting, setVoting] = useState(false);
  const [showVoters, setShowVoters] = useState<string | null>(null);

  const canClose = !poll.isClosed && (poll.createdBy.id === myId || isAdminish);
  const canDelete = poll.createdBy.id === myId || isAdminish;

  const vote = async (optionId: string) => {
    if (poll.isClosed || voting) return;
    setVoting(true);
    try {
      const updated = await api<PollData>(`/api/polls/${poll.id}/vote`, {
        method: "POST",
        body: { optionIds: [optionId] },
      });
      setPoll(updated);
      onUpdate?.(updated);
    } catch { /* ignore */ } finally {
      setVoting(false);
    }
  };

  const closePoll = async () => {
    try {
      const updated = await api<PollData>(`/api/polls/${poll.id}/close`, { method: "PATCH" });
      setPoll(updated);
      onUpdate?.(updated);
    } catch { /* ignore */ }
  };

  const deletePoll = async () => {
    if (!confirm("Hapus poll ini?")) return;
    try {
      await api(`/api/polls/${poll.id}`, { method: "DELETE" });
      onDelete?.(poll.id);
    } catch { /* ignore */ }
  };

  const maxVotes = Math.max(...poll.options.map((o) => o.voteCount), 1);

  return (
    <div className="rounded-2xl border overflow-hidden my-1"
      style={{ background: "var(--sl-surface)", borderColor: "var(--sl-line-strong)", maxWidth: 420 }}>
      {/* Header */}
      <div className="px-4 py-3 border-b" style={{ borderColor: "var(--sl-line-strong)" }}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-medium mb-1" style={{ color: "var(--sl-ink-faint)" }}>
              📊 Poll{poll.isMultiVote ? " · Pilih lebih dari 1" : ""}{poll.isClosed ? " · Ditutup" : ""}
            </p>
            <p className="text-sm font-semibold leading-snug" style={{ color: "var(--sl-ink)" }}>
              {poll.question}
            </p>
          </div>
          {canDelete && (
            <div className="flex gap-1 shrink-0">
              {canClose && (
                <button onClick={closePoll}
                  className="text-xs px-2 py-0.5 rounded-lg transition hover:opacity-70"
                  style={{ color: "var(--sl-ink-faint)", background: "var(--sl-bg)" }}>
                  Tutup
                </button>
              )}
              <button onClick={deletePoll}
                className="text-xs px-2 py-0.5 rounded-lg transition hover:opacity-70"
                style={{ color: "#A5484A", background: "var(--sl-bg)" }}>
                Hapus
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Options */}
      <div className="p-3 space-y-2">
        {poll.options.map((opt) => {
          const isVoted = poll.myVotes.includes(opt.id);
          const pct = poll.totalVotes > 0 ? Math.round((opt.voteCount / poll.totalVotes) * 100) : 0;

          return (
            <div key={opt.id}>
              <button
                onClick={() => vote(opt.id)}
                disabled={poll.isClosed || voting}
                className="w-full text-left rounded-xl overflow-hidden transition relative"
                style={{
                  border: `2px solid ${isVoted ? "var(--sl-accent)" : "var(--sl-line-strong)"}`,
                  background: "var(--sl-bg)",
                }}
              >
                {/* Image option */}
                {opt.imageUrl && (
                  <img src={apiUrl(opt.imageUrl)} alt={opt.text || ""}
                    className="w-full object-cover" style={{ maxHeight: 120, pointerEvents: "none" }} />
                )}
                <div className="relative px-3 py-2">
                  {/* Progress bar background — pointer-events none so it never blocks clicks */}
                  <div className="absolute inset-0 rounded-lg"
                    style={{
                      background: `var(--sl-accent-soft)`,
                      width: `${pct}%`,
                      opacity: poll.myVotes.length > 0 || poll.isClosed ? 1 : 0,
                      transition: "width 400ms ease",
                      pointerEvents: "none",
                    }} />
                  <div className="relative flex items-center justify-between gap-2" style={{ pointerEvents: "none" }}>
                    <span className="text-sm font-medium" style={{ color: "var(--sl-ink)" }}>
                      {isVoted && <span className="mr-1" style={{ color: "var(--sl-accent)" }}>✓</span>}
                      {opt.text || `Opsi ${opt.order + 1}`}
                    </span>
                    {(poll.myVotes.length > 0 || poll.isClosed) && (
                      <span className="text-xs font-semibold shrink-0" style={{ color: "var(--sl-accent)" }}>
                        {pct}% ({opt.voteCount})
                      </span>
                    )}
                  </div>
                </div>
              </button>
              {/* Voters list on hover */}
              {opt.voters.length > 0 && (
                <button
                  onClick={() => setShowVoters(showVoters === opt.id ? null : opt.id)}
                  className="text-[10px] ml-1 transition hover:underline"
                  style={{ color: "var(--sl-ink-fainter)" }}>
                  {opt.voters.slice(0, 3).join(", ")}{opt.voters.length > 3 ? ` +${opt.voters.length - 3}` : ""}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t" style={{ borderColor: "var(--sl-line)", borderTopWidth: 1 }}>
        <p className="text-[11px]" style={{ color: "var(--sl-ink-fainter)" }}>
          {poll.totalVotes} suara · oleh {poll.createdBy.name}
          {poll.isClosed && " · Poll ditutup"}
        </p>
      </div>
    </div>
  );
}
