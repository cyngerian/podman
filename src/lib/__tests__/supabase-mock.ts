import { vi } from "vitest";

/**
 * Test doubles for the PostgREST query builder and `next/navigation`'s
 * `redirect`, shared by the server-action tests.
 *
 * The builder records every call as a flat {@link SupabaseCall} and hands it to
 * a responder, so tests can assert on the exact table, filters and payload a
 * server action used — that's what auth/membership guards come down to.
 */

export type SupabaseOp = "select" | "insert" | "update" | "upsert" | "delete";

export interface SupabaseCall {
  table: string;
  op: SupabaseOp;
  payload?: unknown;
  filters: Array<[string, unknown]>;
  columns?: string;
  head?: boolean;
  single?: boolean;
}

export interface SupabaseResult {
  data?: unknown;
  error?: { message: string } | null;
  count?: number | null;
}

export type Responder = (call: SupabaseCall) => SupabaseResult;

/** Thrown by the mocked `redirect()` so control flow matches production. */
export class RedirectError extends Error {
  constructor(public readonly path: string) {
    super(`NEXT_REDIRECT:${path}`);
    this.name = "RedirectError";
  }
}

export const redirect = vi.fn((path: string) => {
  throw new RedirectError(path);
});

export const revalidatePath = vi.fn();

/** Assert that `fn` redirected to `path`. */
export async function expectRedirect(fn: () => Promise<unknown>, path: string) {
  try {
    await fn();
  } catch (e) {
    if (e instanceof RedirectError) {
      if (e.path !== path) {
        throw new Error(`Expected redirect to ${path}, got ${e.path}`);
      }
      return;
    }
    throw e;
  }
  throw new Error(`Expected a redirect to ${path}, but the action returned normally`);
}

function buildChain(
  call: SupabaseCall,
  responder: Responder,
  calls: SupabaseCall[]
) {
  const chain = {
    eq(column: string, value: unknown) {
      call.filters.push([column, value]);
      return chain;
    },
    select(columns?: string, opts?: { count?: string; head?: boolean }) {
      call.columns = columns;
      if (opts?.head) call.head = true;
      return chain;
    },
    single() {
      call.single = true;
      return chain;
    },
    then<R>(onFulfilled: (value: SupabaseResult) => R, onRejected?: (reason: unknown) => R) {
      calls.push(call);
      let result: SupabaseResult;
      try {
        result = responder(call);
      } catch (e) {
        return Promise.reject(e).then(onFulfilled, onRejected);
      }
      return Promise.resolve({ data: null, error: null, count: null, ...result }).then(
        onFulfilled,
        onRejected
      );
    },
  };
  return chain;
}

export function createSupabaseMock(
  responder: Responder,
  user: { id: string } | null = { id: "user-1" }
) {
  const calls: SupabaseCall[] = [];

  const start = (table: string, op: SupabaseOp, payload?: unknown) =>
    buildChain({ table, op, payload, filters: [] }, responder, calls);

  const client = {
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
    },
    from(table: string) {
      return {
        select: (columns?: string, opts?: { count?: string; head?: boolean }) =>
          start(table, "select").select(columns, opts),
        insert: (payload: unknown) => start(table, "insert", payload),
        update: (payload: unknown) => start(table, "update", payload),
        upsert: (payload: unknown) => start(table, "upsert", payload),
        delete: () => start(table, "delete"),
      };
    },
  };

  const of = (op: SupabaseOp, table?: string) =>
    calls.filter((c) => c.op === op && (table === undefined || c.table === table));

  return { client, calls, of };
}
