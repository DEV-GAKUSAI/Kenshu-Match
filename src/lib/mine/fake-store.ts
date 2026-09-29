import type { MatchCountStore } from "./match-count.ts";
import type { MineHandoffStore } from "./handoff-service.ts";

/** In-memory stand-in for the database, used only by tests. */
export class FakeStore implements MineHandoffStore, MatchCountStore {
  nonces = new Set<string>();
  links = new Map<string, string>(); // mine -> kenshu
  users = new Map<string, { id: string; role: string; email: string; name: string }>();
  authUsers = new Map<string, string>(); // email -> id
  profiles = new Map<string, string>();
  subcategories = [
    { id: "sub-python", name: "Python" },
    { id: "sub-react", name: "React" },
    { id: "sub-excel", name: "Excel" },
    { id: "sub-manual", name: "手動で追加した分野" },
  ];
  expertise = new Map<string, Set<string>>();
  synced = new Map<string, Set<string>>();
  requests: { id: string; field: string; status: string; target: string | null }[] = [];
  responses: { requestId: string; instructorId: string }[] = [];
  failCreateAfterAuth = false;
  failListSubcategories = false;
  private counter = 0;

  private newId() {
    this.counter += 1;
    return `00000000-0000-4000-8000-${String(this.counter).padStart(12, "0")}`;
  }
  async insertNonce(digest: string) {
    if (this.nonces.has(digest)) return "replay" as const;
    this.nonces.add(digest);
    return "ok" as const;
  }
  async getLinkedKenshuUserId(mine: string) {
    return this.links.get(mine) ?? null;
  }
  async getUserByEmail(email: string) {
    const u = [...this.users.values()].find((x) => x.email === email);
    return u ? { id: u.id, role: u.role } : null;
  }
  async getUserRole(id: string) {
    return this.users.get(id)?.role ?? null;
  }
  async createAuthUser(input: { email: string; name: string }) {
    if (this.authUsers.has(input.email)) return { alreadyExists: true as const };
    const id = this.newId();
    this.authUsers.set(input.email, id);
    if (!this.failCreateAfterAuth) {
      this.users.set(id, { id, role: "INSTRUCTOR", email: input.email, name: input.name });
    }
    return { id };
  }
  async findAuthUserIdByEmail(email: string) {
    return this.authUsers.get(email) ?? null;
  }
  async ensureInstructorUserRow(input: { id: string; email: string; name: string }) {
    if (!this.users.has(input.id)) this.users.set(input.id, { ...input, role: "INSTRUCTOR" });
  }
  linkFailuresLeft = 0;
  async insertLink(input: { mineUserId: string; kenshuUserId: string }) {
    if (this.linkFailuresLeft > 0) {
      this.linkFailuresLeft -= 1;
      throw new Error("link write failed");
    }
    if (this.links.has(input.mineUserId)) return "duplicate" as const;
    this.links.set(input.mineUserId, input.kenshuUserId);
    return "ok" as const;
  }
  async updateUserName(id: string, name: string) {
    const u = this.users.get(id);
    if (u) u.name = name;
  }
  async upsertInstructorProfile(id: string, contactEmail: string) {
    this.profiles.set(id, contactEmail);
  }
  async listSubcategories() {
    if (this.failListSubcategories) throw new Error("db down");
    return this.subcategories;
  }
  async getExpertiseIds(id: string) {
    return [...(this.expertise.get(id) ?? [])];
  }
  async getSyncedIds(id: string) {
    return [...(this.synced.get(id) ?? [])];
  }
  async addExpertise(id: string, ids: string[]) {
    const set = this.expertise.get(id) ?? new Set<string>();
    ids.forEach((x) => set.add(x));
    this.expertise.set(id, set);
  }
  async removeExpertise(id: string, ids: string[]) {
    ids.forEach((x) => this.expertise.get(id)?.delete(x));
  }
  async setSynced(id: string, add: string[], remove: string[]) {
    const set = this.synced.get(id) ?? new Set<string>();
    add.forEach((x) => set.add(x));
    remove.forEach((x) => set.delete(x));
    this.synced.set(id, set);
  }
  async listOpenRequestIds(ids: string[]) {
    return this.requests
      .filter((r) => r.target === null && r.status === "pending" && ids.includes(r.field))
      .map((r) => r.id);
  }
  async listRespondedRequestIds(instructorId: string, requestIds: string[]) {
    return this.responses
      .filter((r) => r.instructorId === instructorId && requestIds.includes(r.requestId))
      .map((r) => r.requestId);
  }
}
