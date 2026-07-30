// 채팅 생성 작업 저장소 (프로세스 메모리). 컨테이너 재시작 시 사라짐 — 클라이언트가 404로 감지해 복구한다.
export interface ChatJob {
  status: "pending" | "done" | "error";
  content?: string;
  error?: string;
  detail?: string;
  createdAt: number;
}

const jobs = new Map<string, ChatJob>();
const TTL_MS = 15 * 60 * 1000;

function cleanup() {
  const now = Date.now();
  for (const [id, j] of jobs) if (now - j.createdAt > TTL_MS) jobs.delete(id);
}

export function createJob(): string {
  cleanup();
  const id = crypto.randomUUID();
  jobs.set(id, { status: "pending", createdAt: Date.now() });
  return id;
}
export function completeJob(id: string, content: string) {
  const j = jobs.get(id);
  if (j) { j.status = "done"; j.content = content; }
}
export function failJob(id: string, error: string, detail?: string) {
  const j = jobs.get(id);
  if (j) { j.status = "error"; j.error = error; j.detail = detail; }
}
export function getJob(id: string): ChatJob | undefined {
  cleanup();
  return jobs.get(id);
}
