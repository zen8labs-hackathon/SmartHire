import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Wraps a Supabase client so that every `.from(table).<terminal>()` call
 * is automatically timed — no call-site changes required.
 *
 * How it works:
 *  1. Proxy intercepts `.from(table)` on the client.
 *  2. The returned PostgrestQueryBuilder is itself wrapped in a second Proxy.
 *  3. That inner Proxy intercepts every chained method call (.select, .insert,
 *     .eq, .order …).  When the return value is a thenable (i.e. the query is
 *     now executable), it patches `.then()` so the timer starts exactly when
 *     the query is awaited — the same moment the HTTP request fires.
 *  4. A `__timed` flag prevents double-patching when filter methods return
 *     `this` (the same thenable object).
 */
export function withQueryTiming(client: SupabaseClient): SupabaseClient {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop !== "from") return Reflect.get(target, prop, receiver);

      return (table: string) => {
        const builder = (target as any).from(table);
        return proxyBuilder(builder, table);
      };
    },
  });
}

function proxyBuilder(builder: any, table: string): any {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      const val = Reflect.get(target, prop, receiver);
      if (typeof val !== "function") return val;

      return (...args: any[]) => {
        const result = val.apply(target, args);

        // If the result is a new thenable (not yet timed), patch its .then()
        if (
          result != null &&
          typeof result === "object" &&
          typeof result.then === "function" &&
          !result.__smhTimed
        ) {
          result.__smhTimed = true;
          const origThen = result.then.bind(result);

          // Timer starts here — i.e. when the query is awaited
          result.then = (onFulfilled: any, onRejected: any) => {
            const start = performance.now();
            return origThen(
              (data: any) => {
                const ms = (performance.now() - start).toFixed(1);
                console.log(`[Supabase] .from("${table}").${String(prop)}() → ${ms} ms`);
                return onFulfilled ? onFulfilled(data) : data;
              },
              onRejected,
            );
          };
        }

        return result;
      };
    },
  });
}
