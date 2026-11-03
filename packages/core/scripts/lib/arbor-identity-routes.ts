/**
 * Derive canonical source routes from the pinned named projection.
 *
 * A named projection should not contain duplicate ids, but this consumer must
 * not make identity pins depend on bucket iteration order if a malformed or
 * future projection does. Identical routes deduplicate; any conflicting route
 * (including a sourced route versus explicit source absence) becomes an
 * unresolved `undefined` value and is never quietly asserted as absent.
 */
export type NamedRouteRecord = {
  id: string;
  links?: { github?: string | undefined } | undefined;
};

export type CanonicalRoute = string | null;

/**
 * Return one route state per id. `Map.has(id)` distinguishes an id missing from
 * the projection from an id whose duplicate records conflict; both are
 * unresolved for identity derivation, but neither is an explicit null route.
 */
export function deriveCanonicalRoutes(
  records: readonly NamedRouteRecord[],
): ReadonlyMap<string, CanonicalRoute | undefined> {
  const routes = new Map<string, CanonicalRoute | undefined>();
  for (const record of records) {
    const route = typeof record.links?.github === "string" && record.links.github.length > 0
      ? record.links.github
      : null;
    if (!routes.has(record.id)) {
      routes.set(record.id, route);
      continue;
    }
    const previous = routes.get(record.id);
    if (previous !== route) routes.set(record.id, undefined);
  }
  return routes;
}
