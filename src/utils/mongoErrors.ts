/**
 * Detects a MongoDB duplicate-key (E11000) failure.
 *
 * Deliberately structural rather than `err instanceof MongoServerError`:
 * mongoose bundles its own copy of the mongodb driver, so an error thrown
 * through mongoose is not an instance of the class exported by a top-level
 * `mongodb` import. Checking the shape works regardless of which copy threw.
 */
export function isDuplicateKeyError(err: unknown): err is { code: number; keyPattern?: Record<string, unknown> } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 11000
  );
}

/** Returns the first field named in a duplicate-key error, for messaging. */
export function duplicateKeyField(err: unknown): string {
  if (isDuplicateKeyError(err) && err.keyPattern) {
    return Object.keys(err.keyPattern)[0] ?? 'field';
  }
  return 'field';
}
