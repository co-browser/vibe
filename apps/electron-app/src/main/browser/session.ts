import { session } from "electron";

type SessionPartitionResolver = (partition: string) => Electron.Session;

let resolvePartitionImpl: SessionPartitionResolver = partition =>
  session.fromPartition(partition);

/**
 * Sets a custom resolver function for retrieving Electron sessions by partition identifier.
 *
 * Replaces the default session resolution logic, allowing alternative strategies for mapping partition strings to Electron `Session` objects.
 *
 * @param resolver - A function that takes a partition identifier and returns the corresponding Electron `Session`.
 */
export function setSessionPartitionResolver(
  resolver: SessionPartitionResolver,
) {
  resolvePartitionImpl = resolver;
}

/**
 * Retrieves the Electron session associated with the specified partition identifier.
 *
 * Uses the current session partition resolver, which can be customized via `setSessionPartitionResolver`.
 *
 * @param partition - The partition identifier for which to retrieve the session
 * @returns The Electron session corresponding to the given partition
 */
export function resolvePartition(partition: string) {
  return resolvePartitionImpl(partition);
}
