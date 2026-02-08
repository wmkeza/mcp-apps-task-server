import {
  RESOURCE_MIME_TYPE,
  registerAppResource,
  registerAppTool,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  CallToolResult,
  ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

// ビルド済み UI の格納先
// tsx で直接実行時は ./dist、tsc ビルド後（build/）はプロジェクトルートの dist
const DIST_DIR = import.meta.filename.endsWith(".ts")
  ? path.join(import.meta.dirname, "dist")
  : import.meta.dirname;

// ---------- OutSystems REST API ----------

const TASK_API_BASE =
  process.env.TASK_API_BASE ||
  "https://xxx.outsystems.app/TaskManagementAPI/rest/Mcp";

interface Task {
  Id: number;
  Title: string;
  Description: string;
  Priority?: number;
  DueDate: string;
  Status?: number;
}

const taskSchema = z.object({
  Id: z.number(),
  Title: z.string(),
  Description: z.string(),
  Priority: z.number().optional().default(0),
  DueDate: z.string(),
  Status: z.number().optional().default(0),
});

async function fetchTasks(): Promise<Task[]> {
  const res = await fetch(`${TASK_API_BASE}/GetTasks`);
  if (!res.ok) {
    const errorDetail = await res.text().catch(() => "");
    throw new Error(
      `GetTasks failed: ${res.status} ${res.statusText}${errorDetail ? ` - ${errorDetail}` : ""}`,
    );
  }
  const data = (await res.json()) as Task[];
  // Status と Priority がない場合はデフォルト値を設定
  return data.map((task) => ({
    ...task,
    Priority: task.Priority ?? 0,
    Status: task.Status ?? 0,
  }));
}

async function createTask(task: Omit<Task, "Id">): Promise<Task> {
  const res = await fetch(`${TASK_API_BASE}/CreateTask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ Task: task }),
  });
  if (!res.ok) {
    const errorDetail = await res.text().catch(() => "");
    throw new Error(
      `CreateTask failed: ${res.status} ${res.statusText}${errorDetail ? ` - ${errorDetail}` : ""}`,
    );
  }
  return (await res.json()) as Task;
}

// ---------- サーバー構築 ----------

export function createServer(): McpServer {
  const server = new McpServer({
    name: "Task MCP App",
    version: "1.0.0",
  });

  // Tool と Resource を紐付ける URI
  const resourceUri = "ui://task-app/mcp-app.html";

  // ---- Tool 1: list-tasks（タスク一覧を返す。UI も表示される） ----
  registerAppTool(
    server,
    "list-tasks",
    {
      title: "List Tasks",
      description:
        "タスクの一覧を取得し、UI に表示します。USE THIS TOOL when the user asks to see or list tasks.",
      inputSchema: z.object({}),
      outputSchema: z.object({
        tasks: z.array(taskSchema),
        error: z.string().nullable(),
      }),
      _meta: { ui: { resourceUri } }, // ← ここで UI を紐付け
    },
    async (): Promise<CallToolResult> => {
      try {
        const tasks = await fetchTasks();
        return {
          content: [
            {
              type: "text",
              text: `${tasks.length} 件のタスクを UI に表示しました。`,
            },
          ],
          structuredContent: { tasks, error: null },
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text", text: `エラー: ${msg}` }],
          structuredContent: { tasks: [], error: msg },
        };
      }
    },
  );

  // ---- Tool 2: add-task（タスクを追加。UI からのみ呼び出し） ----
  registerAppTool(
    server,
    "add-task",
    {
      title: "Add Task",
      description:
        "新しいタスクを追加します。This tool is called from the UI app only (not directly by Claude).",
      inputSchema: z.object({
        Title: z.string().describe("タスクのタイトル"),
        Description: z.string().describe("タスクの説明"),
        DueDate: z.string().describe("期限（ISO 8601 形式）"),
      }),
      outputSchema: z.object({
        tasks: z.array(taskSchema),
        error: z.string().nullable(),
      }),
      _meta: { ui: { resourceUri, visibility: ["app"] } },
    },
    async ({ Title, Description, DueDate }): Promise<CallToolResult> => {
      try {
        await createTask({
          Title,
          Description,
          Priority: 1,
          DueDate,
          Status: 0,
        });
        const tasks = await fetchTasks();
        return {
          content: [
            { type: "text", text: `タスク "${Title}" を追加しました。` },
          ],
          structuredContent: { tasks, error: null },
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text", text: `エラー: ${msg}` }],
          structuredContent: { tasks: [], error: msg },
        };
      }
    },
  );

  // ---- UI Resource: バンドル済み HTML を返す ----
  registerAppResource(
    server,
    resourceUri,
    resourceUri,
    { mimeType: RESOURCE_MIME_TYPE },
    async (): Promise<ReadResourceResult> => {
      const html = await fs.readFile(
        path.join(DIST_DIR, "mcp-app.html"),
        "utf-8",
      );
      return {
        contents: [
          { uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: html },
        ],
      };
    },
  );

  return server;
}
