// src/stormee/stormeeWsShim.ts

/**
 * React Native WebSocket is not the same as DOM WebSocket.
 * This shim makes TypeScript stop breaking when the library expects DOM fields.
 */

export function patchReactNativeWebSocketTypes() {
  const WS: any = globalThis.WebSocket;

  if (!WS) {
    console.warn("WebSocket not found in global scope");
    return;
  }

  // Add missing constants if needed
  if (WS.OPEN === undefined) WS.OPEN = 1;
  if (WS.CLOSED === undefined) WS.CLOSED = 3;
}
