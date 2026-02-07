import { App } from "@modelcontextprotocol/ext-apps";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// ---------- 型定義 ----------

interface Task {
  Id: number;
  Title: string;
  Description: string;
  Priority: number;
  DueDate: string;
  Status: number;
}

interface TaskResult {
  tasks: Task[];
  error: string | null;
}

// ---------- DOM 参照 ----------

const taskListEl = document.getElementById("task-list")!;
const countEl = document.getElementById("count")!;
const statusEl = document.getElementById("status")!;
const titleInput = document.getElementById("new-title") as HTMLInputElement;
const descInput = document.getElementById("new-desc") as HTMLInputElement;
const dateInput = document.getElementById("new-date") as HTMLInputElement;
const addBtn = document.getElementById("add-btn")!;

// ---------- ヘルパー ----------

const STATUS_LABELS: Record<number, string> = { 0: "未着手", 1: "完了" };

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("ja-JP");
}

function showStatus(message: string) {
  statusEl.textContent = message;
  statusEl.style.display = "block";
  setTimeout(() => {
    statusEl.style.display = "none";
  }, 2000);
}

// ---------- 描画 ----------

function renderTasks(tasks: Task[]) {
  countEl.textContent = `${tasks.length} 件`;

  if (tasks.length === 0) {
    taskListEl.innerHTML =
      '<div class="empty">タスクはまだありません。上のフォームから追加してください。</div>';
    return;
  }

  taskListEl.innerHTML = tasks
    .map(
      (t) => `
      <div class="task-item">
        <div class="task-header">
          <span class="task-title">${escapeHtml(t.Title)}</span>
          <span class="badge status-${t.Status}">${STATUS_LABELS[t.Status] ?? t.Status}</span>
        </div>
        ${t.Description ? `<div class="task-desc">${escapeHtml(t.Description)}</div>` : ""}
        ${t.DueDate ? `<div class="task-date">期限: ${formatDate(t.DueDate)}</div>` : ""}
      </div>
    `,
    )
    .join("");
}

// ---------- MCP Apps SDK 連携 ----------

const app = new App({ name: "Task App", version: "1.0.0" });

// ツール結果のパース & 描画
function handleToolResult(result: CallToolResult) {
  if (result.isError) {
    showStatus("エラーが発生しました");
    return;
  }
  const data = result.structuredContent as unknown as TaskResult;
  if (data?.error) {
    showStatus(`エラー: ${data.error}`);
  } else if (data?.tasks) {
    renderTasks(data.tasks);
    statusEl.style.display = "none";
  }
}

// ホストからツール結果を受け取る（初回の list-tasks の結果）
app.ontoolresult = (result) => {
  console.info("Received tool result:", result);
  handleToolResult(result);
};

// タスクの追加
async function addTask() {
  const Title = titleInput.value.trim();
  if (!Title) return;

  const Description = descInput.value.trim();
  const DueDate = dateInput.value
    ? new Date(dateInput.value).toISOString()
    : new Date().toISOString();

  titleInput.value = "";
  descInput.value = "";
  dateInput.value = "";
  showStatus("追加中...");

  try {
    const result = await app.callServerTool({
      name: "add-task",
      arguments: { Title, Description, DueDate },
    });
    handleToolResult(result);
    showStatus("追加しました！");
  } catch (e) {
    console.error("Failed to add task:", e);
    showStatus("追加に失敗しました");
  }
}

// ---------- イベント設定 ----------

addBtn.addEventListener("click", addTask);
titleInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addTask();
});

// ---------- ホストに接続 ----------

app.connect().then(() => {
  console.info("Connected to host");
});
