"use strict";

// packages/core/src/trusted-runtime/runner.ts
var import_node_http = require("node:http");
var import_node_module = require("node:module");
var import_node_fs = require("node:fs");
var import_node_crypto2 = require("node:crypto");

// packages/sdk/dist/music.js
var record = (value) => !!value && typeof value === "object" && !Array.isArray(value);
var text = (value, max = 4096) => typeof value === "string" && value.length <= max;
var milliseconds = (value) => Number.isFinite(value) && Number(value) >= 0;
function assertResourceRef(value) {
  if (!record(value) || !["providerId", "kind", "id"].every((key2) => text(value[key2], 2048) && value[key2].length > 0) || value.pluginId !== void 0 && (!text(value.pluginId, 2048) || !value.pluginId))
    throw new Error("Invalid resource reference");
  if (value.connectionId !== void 0 && (!text(value.connectionId, 2048) || !value.connectionId))
    throw new Error("Invalid resource connection");
  if (value.scope !== void 0 && (value.scope !== "provider" || value.kind !== "track" || value.connectionId !== void 0))
    throw new Error("Provider scope requires a public track without a connection");
  if (value.pluginId === void 0 && value.scope !== "provider")
    throw new Error("Private resources require an owning plugin");
  if (value.data !== void 0) {
    if (!record(value.data))
      throw new Error("Invalid resource private data");
    let encoded;
    try {
      encoded = JSON.stringify(value.data);
    } catch {
      throw new Error("Resource private data must be JSON");
    }
    if (new TextEncoder().encode(encoded).byteLength > 64 * 1024)
      throw new Error("Resource private data exceeds 64 KiB");
  }
}
function assertContentPage(value) {
  if (!record(value) || !Array.isArray(value.items) || value.items.length > 1e4)
    throw new Error("Invalid content page");
  if (value.nextCursor != null && (!text(value.nextCursor, 2048) || !value.nextCursor.length))
    throw new Error("Invalid pagination cursor");
  for (const item of value.items) {
    if (!record(item) || !text(item.title) || !Array.isArray(item.capabilities) || !item.capabilities.every((entry) => text(entry, 128)))
      throw new Error("Invalid content item");
    assertResourceRef(item.ref);
    if (item.ref.kind === "track") {
      if (!record(item.metadata) || !Array.isArray(item.metadata.artists) || !item.metadata.artists.every((artist) => text(artist)))
        throw new Error("Track metadata must contain artists");
      if (item.metadata.durationMs !== void 0 && !milliseconds(item.metadata.durationMs))
        throw new Error("Invalid track duration");
      const { qualities, qualitySizes, qualitySizeLabels, hash } = item.metadata;
      if (hash !== void 0 && !text(hash, 4096))
        throw new Error("Invalid track hash");
      if (qualitySizeLabels !== void 0 && (!record(qualitySizeLabels) || Object.keys(qualitySizeLabels).length > 128 || Object.entries(qualitySizeLabels).some(([quality, label]) => !qualities?.includes(quality) || !text(label, 128))))
        throw new Error("Invalid track quality size labels");
      if (qualities !== void 0 && (!Array.isArray(qualities) || qualities.length > 128 || !qualities.every((quality) => text(quality, 128) && !!quality)))
        throw new Error("Invalid track qualities");
      if (qualitySizes !== void 0 && (!record(qualitySizes) || Object.keys(qualitySizes).length > 128 || Object.entries(qualitySizes).some(([quality, bytes]) => !qualities?.includes(quality) || !Number.isSafeInteger(bytes) || Number(bytes) <= 0)))
        throw new Error("Invalid track quality sizes");
    }
    if (item.ref.kind === "playlist" && item.playlist !== void 0) {
      if (!record(item.playlist))
        throw new Error("Invalid playlist metadata");
      if (item.playlist.trackCount !== void 0 && (!Number.isInteger(item.playlist.trackCount) || item.playlist.trackCount < 0))
        throw new Error("Invalid playlist track count");
    }
    if (item.ref.kind === "chart" && item.chart !== void 0 && !record(item.chart))
      throw new Error("Invalid chart metadata");
  }
}

// packages/sdk/dist/validate.js
function assertSearchRequest(value) {
  const request = value;
  if (!request || typeof request.query !== "string" || request.query.length > 4096 || !Array.isArray(request.kinds) || request.kinds.length > 32 || !request.kinds.every((kind) => typeof kind === "string" && kind.length > 0 && kind.length <= 128) || !request.filters || typeof request.filters !== "object" || Array.isArray(request.filters) || request.cursor !== void 0 && (typeof request.cursor !== "string" || request.cursor.length > 2048) || !Number.isSafeInteger(request.limit) || request.limit < 1 || request.limit > 1e3)
    throw new Error("Invalid music search request");
}
function assertRemovableTracks(value) {
  if (!Array.isArray(value) || value.length === 0)
    throw new Error("Invalid playlist removal items");
  if (value.length > 1e3)
    throw new Error("Invalid playlist removal items");
  for (const item of value) {
    if (!item || typeof item !== "object")
      throw new Error("Invalid playlist removal item");
    const ref2 = item.ref;
    if (!ref2 || typeof ref2 !== "object" || ref2.kind !== "track")
      throw new Error("Only tracks can be removed");
    if (typeof ref2.id !== "string" || !ref2.id)
      throw new Error("Invalid playlist removal item");
  }
}

// packages/sdk/dist/navigation.js
var PLUGIN_ROUTE_NAMES = ["welcome", "home", "find", "songlist", "local", "recent", "search", "recognize", "list", "download", "local-tag-editor", "profile", "community", "settings", "plugin-page"];
var routeKeys = { list: ["id"], "plugin-page": ["pluginId", "pageId"] };
var queryKeys = { search: ["keyword"], list: ["type", "source"], settings: ["section"] };
var safeKey = (key2) => /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(key2) && !["constructor", "prototype", "__proto__"].includes(key2);
function routeFields(value, allowed, strict, ids) {
  const result = {};
  if (value === void 0)
    return result;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid route fields");
  for (const [key2, field] of Object.entries(value)) {
    if (!safeKey(key2) || allowed && !allowed.includes(key2) || typeof field !== "string" || field.length > 1024 || ids && !/^[a-zA-Z0-9._-]{1,256}$/.test(field)) {
      if (strict)
        throw Error("Invalid route field: " + key2);
      continue;
    }
    if (Object.keys(result).length >= 24) {
      if (strict)
        throw Error("Too many route fields");
      break;
    }
    result[key2] = field;
  }
  return result;
}
function validatePluginRouteTarget(value, manifest) {
  const target = value;
  if (!target || typeof target !== "object" || Array.isArray(target) || Object.keys(target).some((key2) => !["name", "params", "query"].includes(key2)) || !PLUGIN_ROUTE_NAMES.includes(target.name))
    throw Error("Invalid named plugin route");
  const params = routeFields(target.params, routeKeys[target.name] ?? [], true, true);
  if (routeKeys[target.name]?.some((key2) => !params[key2]))
    throw Error("Missing route parameter");
  if (target.name === "plugin-page" && (params.pluginId !== manifest.id || !manifest.ui?.pages?.some((page) => page.id === params.pageId)))
    throw Error("Plugin page is not owned by caller");
  return { name: target.name, params, query: routeFields(target.query, target.name === "plugin-page" ? void 0 : queryKeys[target.name] ?? [], true, false) };
}
function assertNavigationRequest(value, manifest) {
  const request = value;
  if (!request || typeof request !== "object" || Array.isArray(request) || !["search", "playlist", "charts", "downloads", "account", "settings"].includes(request.page) || request.query !== void 0 && (typeof request.query !== "string" || request.query.length > 8192))
    throw new Error("Invalid Host navigation request");
  if (request.ref !== void 0)
    assertResourceRef(request.ref);
  if (request.sectionId !== void 0) {
    if (request.page !== "playlist" || typeof request.sectionId !== "string" || !request.sectionId.length || request.sectionId.length > 128)
      throw new Error("sectionId is only valid for playlist navigation");
    if (manifest && !manifest.ui?.pages?.some((page) => page.mount === "playlist-section" && page.id === request.sectionId))
      throw new Error("Unknown playlist section: " + request.sectionId);
  }
}

// packages/sdk/dist/links.js
function publicLink(value) {
  if (typeof value !== "string" || value.length > 8192 || /[\s\u0000-\u001f\u007f]/.test(value))
    return null;
  try {
    const url = new URL(value);
    if (!["https:", "http:", "cerumusic:", "ceru:"].includes(url.protocol) || url.username || url.password)
      return null;
    if (url.protocol === "ceru:")
      url.protocol = "cerumusic:";
    const path = decodeURIComponent(url.host + url.pathname);
    if (/(?:^|\/)(?:oauth|auth|login|logout|callback)(?:\/|$)/i.test(path) || /^plugin(?:\/|$)/i.test(path))
      return null;
    if (url.hash)
      return null;
    for (const key2 of url.searchParams.keys()) {
      if (/(?:token|secret|password|passwd|credential|authorization|signature|cookie|session|^code$|^state$|^key$|^url$|^redirect)/i.test(key2))
        return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

// packages/sdk/dist/events.js
function operationEventPermission(name) {
  const done = name.endsWith(":done");
  const operation2 = done ? name.slice(0, -5) : name;
  const group = operation2.split(".")[0];
  const permissions = {
    player: ["player.intercept", "player.read"],
    queue: ["player.intercept", "player.read"],
    track: ["library.intercept", "library.read"],
    playlist: ["library.intercept", "library.read"],
    account: ["account.intercept", "account.profile"],
    search: ["search.intercept", "search.read"],
    lyrics: ["lyrics.intercept", "player.read"],
    download: ["downloads.intercept", "downloads.manage"],
    share: ["sharing.intercept", "music.read"],
    link: ["links.intercept", "links.read"],
    notification: ["notifications.intercept", "notifications.read"],
    window: ["window.intercept", "window.read"]
  };
  return permissions[group]?.[done ? 1 : 0];
}

// packages/core/src/download-operations.ts
var operation = { intercept: "downloads.intercept", hookTimeoutMs: 3e3, defaultIn: "main" };
var DOWNLOAD_OPERATIONS = {
  "download.create": { ...operation, cancelable: true, announce: true },
  "download.filename": { ...operation, cancelable: false, announce: false }
};
var key = (track4) => JSON.stringify([track4.ref.providerId, track4.ref.id]);
function track(value) {
  if (!value || value.ref?.kind !== "track" || typeof value.ref.providerId !== "string" || !/^[\w.-]{1,128}$/.test(value.ref.providerId) || value.ref.providerId === "local" || typeof value.ref.id !== "string" || !/^[\w.-]{1,256}$/.test(value.ref.id) || typeof value.title !== "string" || value.title.length > 512 || !Array.isArray(value.metadata?.artists) || value.metadata.artists.length > 32 || !value.metadata.artists.every((artist) => typeof artist === "string" && artist.length <= 256)) throw Error("Invalid download track");
  return { ref: { kind: "track", providerId: value.ref.providerId, id: value.ref.id }, title: value.title, metadata: { artists: [...value.metadata.artists] } };
}
function downloadInput(name, value, original) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Invalid download input");
  if (name === "download.create") {
    const input2 = value;
    if (Object.keys(input2).some((key2) => !["tracks", "quality", "directory"].includes(key2)) || !Array.isArray(input2.tracks) || input2.tracks.length > 1e3 || typeof input2.quality !== "string" || !/^[\w.-]{1,64}$/.test(input2.quality) || input2.directory !== void 0 && !/^[a-f0-9-]{36}$/.test(input2.directory)) throw Error("Invalid download request");
    const initial = original && "tracks" in original ? original : void 0;
    if (initial && input2.directory !== initial.directory) throw Error("Cannot change download directory");
    const remaining = /* @__PURE__ */ new Map();
    for (const item of initial?.tracks ?? []) {
      const row = remaining.get(key(item)) ?? [];
      row.push(item);
      remaining.set(key(item), row);
    }
    const tracks2 = Array.from(input2.tracks, (item) => {
      const clean = track(item);
      if (!initial) return clean;
      const selected2 = remaining.get(key(clean))?.shift();
      if (!selected2) throw Error("Cannot add or duplicate download tracks");
      return selected2;
    });
    return { tracks: tracks2, quality: input2.quality, ...input2.directory === void 0 ? {} : { directory: input2.directory } };
  }
  const input = value, selected = track(input.track);
  if (Object.keys(input).some((key2) => key2 !== "track" && key2 !== "name") || typeof input.name !== "string" || !input.name || input.name.length > 255 || /[\\/:*?"<>|\u0000-\u001f]/.test(input.name) || /[. ]$/.test(input.name) || /^\./.test(input.name) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(input.name)) throw Error("Invalid download filename");
  if (original && "name" in original && (key(selected) !== key(original.track) || input.name.split(".").at(-1) !== original.name.split(".").at(-1))) throw Error("Cannot change download track or file format");
  return { track: original && "name" in original ? original.track : selected, name: input.name };
}

// packages/core/src/system-operations.ts
var SYSTEM_OPERATIONS = {
  "link.open": { intercept: "links.intercept", cancelable: true, hookTimeoutMs: 3e3, defaultIn: "renderer", announce: true },
  "notification.show": { intercept: "notifications.intercept", cancelable: true, hookTimeoutMs: 3e3, defaultIn: "renderer", announce: false }
};
function isSystemOperation(name) {
  return name === "link.open" || name === "notification.show";
}
function systemInput(name, value, original) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Invalid system operation");
  if (name === "link.open") {
    if (Object.keys(value).some((key2) => !["url", "from"].includes(key2)) || !("url" in value) || !("from" in value)) throw Error("Invalid link input");
    const url = publicLink(value.url), from = value.from;
    if (!url || !["paste", "drop", "deeplink"].includes(String(from)) || original && "from" in original && from !== original.from) throw Error("Invalid public link");
    return { url, from };
  }
  const row = value;
  if (Object.keys(value).some((key2) => !["title", "body", "level"].includes(key2)) || typeof row.title !== "string" || row.title.length > 512 || typeof row.body !== "string" || row.body.length > 8192 || !["info", "success", "warning", "error"].includes(row.level)) throw Error("Invalid notification input");
  return { title: row.title, body: row.body, level: row.level };
}

// packages/core/src/operation-bus.ts
var SHARING_OPERATIONS = { "share.create": { intercept: "sharing.intercept", cancelable: true, hookTimeoutMs: 3e3, defaultIn: "renderer", announce: true } };
function shareInput(_name, value, original) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 1 || !("track" in value)) throw Error("Invalid share input");
  const input = resolveInput("player.resolve", { track: value.track, quality: "" }, original ? { ...original, quality: "" } : void 0);
  return { track: input.track };
}
function shareResult(_name, value) {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value) || !("url" in value) || !("id" in value) || typeof value.url !== "string" || value.url.length > 8192 || typeof value.id !== "string" || !value.id || value.id.length > 4096 || Object.keys(value).some((key2) => !["url", "id", "template"].includes(key2))) throw Error("Invalid share result");
  const url = new URL(value.url);
  if (!["https:", "http:", "cerumusic:"].includes(url.protocol) || url.username || url.password) throw Error("Invalid share link");
  if ("template" in value && (typeof value.template !== "string" || value.template.length > 16384)) throw Error("Invalid share text");
  return { id: value.id, url: url.href, ..."template" in value ? { template: value.template } : {} };
}
var lyricOperation = { intercept: "lyrics.intercept", cancelable: false, hookTimeoutMs: 3e3, defaultIn: "main", announce: false };
var LYRIC_OPERATIONS = { "lyrics.load": lyricOperation, "lyrics.transform": lyricOperation };
var playerOperation = {
  intercept: "player.intercept",
  observe: "player.read",
  cancelable: true,
  hookTimeoutMs: 800,
  defaultIn: "renderer",
  announce: true
};
var WINDOW_OPERATIONS = { "window.close": { intercept: "window.intercept", cancelable: true, hookTimeoutMs: 800, defaultIn: "renderer", announce: true } };
function windowCloseInput(_name, value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length) throw Error("Expected empty window close input");
  return {};
}
var PLAYBACK_OPERATIONS = {
  "player.play": playerOperation,
  "queue.add": playerOperation,
  "queue.remove": playerOperation,
  "queue.clear": playerOperation,
  "queue.shuffle": { ...playerOperation, cancelable: false, announce: false },
  "player.pause": playerOperation,
  "player.resume": playerOperation,
  "player.previous": playerOperation,
  "player.next": playerOperation,
  "player.error": { ...playerOperation, announce: false },
  "player.queueEnded": { ...playerOperation, announce: false },
  "player.setMode": playerOperation,
  "player.seek": { ...playerOperation, cancelable: false },
  "player.setVolume": { ...playerOperation, cancelable: false }
};
var RESOLVE_OPERATIONS = { "player.resolve": { ...playerOperation, cancelable: false, defaultIn: "main", announce: false } };
function resolveInput(_name, value, original) {
  const packet = value;
  if (!packet || Object.keys(packet).some((key2) => key2 !== "track" && key2 !== "quality") || typeof packet.quality !== "string" || !/^[\w.-]{0,64}$/.test(packet.quality)) throw Error("Invalid resolve quality");
  const selected = track2(packet.track);
  const ref2 = packet.track.ref;
  if ("connectionId" in ref2 || "data" in ref2 || "pluginId" in ref2 && (!("scope" in ref2) || ref2.scope !== "provider")) throw Error("Cannot substitute a private resource");
  if (selected.ref.providerId === "local" || selected.ref.providerId === "private" && original && (original.track.ref.providerId !== "private" || selected.ref.id !== original.track.ref.id)) throw Error("Invalid resolve track handle");
  return { track: selected, quality: packet.quality };
}
var libraryOperation = { intercept: "library.intercept", cancelable: true, hookTimeoutMs: 3e3, defaultIn: "renderer", announce: true };
var LIBRARY_OPERATIONS = { "track.like": { ...libraryOperation, hookTimeoutMs: 800 }, "playlist.create": libraryOperation, "playlist.delete": libraryOperation, "playlist.addTracks": libraryOperation, "playlist.removeTracks": libraryOperation, "playlist.export": libraryOperation, "playlist.import": libraryOperation };
function isLibraryOperation(name) {
  return typeof name === "string" && Object.hasOwn(LIBRARY_OPERATIONS, name);
}
function libraryInput(name, value, original) {
  if (name === "track.like") return likeInput(name, value, original && "liked" in original ? original : void 0);
  if (name === "playlist.import") {
    const input2 = value;
    if (!input2 || typeof input2.value !== "string" || !input2.value.trim() || input2.value.length > 4096 || /^(?:file:|[a-z]:[\\/]|[\\/])/i.test(input2.value.trim()) || Object.keys(input2).some((key2) => key2 !== "value" && key2 !== "importerId") || input2.importerId !== void 0 && (typeof input2.importerId !== "string" || !/^[\w.-]{1,128}:[\w.-]{1,128}$/.test(input2.importerId))) throw Error("Invalid playlist import");
    return { value: input2.value.trim(), ...input2.importerId === void 0 ? {} : { importerId: input2.importerId } };
  }
  if (name === "playlist.create") {
    const input2 = value;
    if (!input2 || typeof input2.name !== "string" || !input2.name.trim() || input2.name.length > 512 || !["local", "cloud"].includes(input2.location) || Object.keys(input2).some((key2) => key2 !== "name" && key2 !== "location")) throw Error("Invalid playlist creation");
    if (original && "location" in original && original.location !== input2.location) throw Error("Cannot redirect playlist creation");
    return { name: input2.name, location: input2.location };
  }
  const input = value;
  const playlist2 = input?.playlist;
  if (!playlist2 || Object.keys(playlist2).some((key2) => !["id", "name", "location"].includes(key2)) || typeof playlist2.id !== "string" || !playlist2.id.trim() || playlist2.id.length > 256 || typeof playlist2.name !== "string" || !playlist2.name.trim() || playlist2.name.length > 512 || !["local", "cloud", "both"].includes(playlist2.location)) throw Error("Invalid playlist");
  if (original && "playlist" in original && (original.playlist.id !== playlist2.id || original.playlist.name !== playlist2.name || original.playlist.location !== playlist2.location)) throw Error("Cannot redirect playlist operation");
  const target = { playlist: { id: playlist2.id, name: playlist2.name, location: playlist2.location } };
  if (name === "playlist.export") {
    const packet = value;
    if (Object.keys(packet).length !== 2 || !Object.hasOwn(packet, "playlist") || !Object.hasOwn(packet, "format") || packet.format !== "cmpl" && packet.format !== "cpl") throw Error("Invalid playlist export");
    return { ...target, format: packet.format };
  }
  if (name === "playlist.delete") {
    if (Object.keys(input).length !== 1 || !Object.hasOwn(input, "playlist")) throw Error("Invalid playlist deletion");
    return target;
  }
  if (Object.keys(input).length !== 2 || !Object.hasOwn(input, "playlist") || !Object.hasOwn(input, "tracks") || !Array.isArray(input.tracks) || input.tracks.length > 1e3) throw Error("Invalid playlist tracks");
  const keyOf = (item) => JSON.stringify([item.ref.providerId, item.ref.id]);
  const allowed = original && "tracks" in original ? new Map(original.tracks.map((item) => [keyOf(item), item])) : void 0;
  const seen = /* @__PURE__ */ new Set();
  const tracks2 = Array.from(input.tracks, (item) => {
    const projected = track2(item);
    if (projected.ref.providerId === "local" || !/^[\w.-]{1,256}$/.test(projected.ref.id)) throw Error("Expected a public track reference or private handle");
    const key2 = keyOf(projected);
    if (seen.has(key2) || allowed && !allowed.has(key2)) throw Error("Track outside original playlist selection or repeated");
    seen.add(key2);
    return allowed?.get(key2) ?? projected;
  });
  return { ...target, tracks: tracks2 };
}
function likeInput(_name, value, original) {
  const input = value;
  if (!input || typeof input.liked !== "boolean" || Object.keys(input).some((key2) => key2 !== "track" && key2 !== "liked")) throw Error("Invalid favorite operation");
  const selected = track2(input.track);
  if (original && selected.ref.providerId === "private" && (original.track.ref.providerId !== "private" || selected.ref.id !== original.track.ref.id)) throw Error("Invalid private track handle");
  return { track: selected, liked: input.liked };
}
var searchOperation = { intercept: "search.intercept", hookTimeoutMs: 800, defaultIn: "renderer", announce: false };
var SEARCH_OPERATIONS = { "search.query": { ...searchOperation, cancelable: true }, "search.suggest": { ...searchOperation, cancelable: false }, "search.results": { ...searchOperation, cancelable: false } };
var ACCOUNT_OPERATIONS = { "account.switch": { intercept: "account.intercept", cancelable: true, hookTimeoutMs: 3e3, defaultIn: "main", announce: false } };
function track2(value) {
  const ref2 = value?.ref;
  if (ref2?.kind !== "track" || typeof ref2.id !== "string" || !ref2.id || ref2.id.length > 512 || typeof ref2.providerId !== "string" || !/^[\w.-]{1,128}$/.test(ref2.providerId))
    throw Error("Invalid operation track");
  if (typeof value.title !== "string" || value.title.length > 512 || !Array.isArray(value.metadata?.artists) || value.metadata.artists.length > 32 || !value.metadata.artists.every(
    (artist) => typeof artist === "string" && artist.length <= 256
  ))
    throw Error("Invalid operation metadata");
  return {
    ref: { kind: "track", id: ref2.id, providerId: ref2.providerId },
    title: value.title,
    metadata: { artists: [...value.metadata.artists] }
  };
}
function playbackInput(name, value) {
  if (name === "player.queueEnded") {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key2) => key2 !== "tracks")) throw Error("Invalid queue end input");
    if (!Object.hasOwn(value, "tracks")) return {};
    if (!Array.isArray(value.tracks) || !value.tracks.length || value.tracks.length > 1e3) throw Error("Expected continuation tracks");
    return { tracks: Array.from(value.tracks, (item) => {
      if (!item || typeof item !== "object" || !("ref" in item) || !item.ref || typeof item.ref !== "object") throw Error("Expected a continuation track");
      const selected = track2(item);
      if (["local", "private"].includes(selected.ref.providerId) || !/^[\w.-]{1,256}$/.test(selected.ref.id) || Object.keys(item.ref).some((key2) => !["kind", "providerId", "id", "scope"].includes(key2)) || "scope" in item.ref && item.ref.scope !== "provider") throw Error("Expected a public continuation track");
      return selected;
    }) };
  }
  if (name === "queue.shuffle") {
    if (!value || Object.keys(value).length !== 1 || !Array.isArray(value.items) || value.items.length > 1e3) throw Error("Invalid shuffle items");
    return { items: Array.from(value.items, track2) };
  }
  if (name === "player.error") {
    if (!value || Object.keys(value).some((key2) => key2 !== "error" && key2 !== "track") || !["resolve", "start", "media", "playback"].includes(value.error)) throw Error("Invalid playback failure");
    return { track: track2(value.track), error: value.error };
  }
  if (name === "queue.remove" || name === "queue.clear") {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key2) => key2 !== "tracks")) throw Error("Invalid queue removal");
    if (name === "queue.clear" && !Object.hasOwn(value, "tracks")) return {};
    if (!Object.hasOwn(value, "tracks") || !Array.isArray(value.tracks) || value.tracks.length > 1e3) throw Error("Expected queue tracks");
    return { tracks: value.tracks.map(track2) };
  }
  if (name === "player.setMode") {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 1 || !Object.hasOwn(value, "mode") || !["sequence", "random", "single"].includes(value.mode)) throw Error("Invalid playback mode");
    return { mode: value.mode };
  }
  if (name === "player.seek" || name === "player.setVolume") {
    const key2 = name === "player.seek" ? "positionMs" : "volume";
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 1 || !Object.hasOwn(value, key2)) throw Error("Invalid " + name + " input");
    const number = value[key2];
    if (!Number.isFinite(number) || number < 0 || (key2 === "volume" ? number > 1 : !Number.isSafeInteger(number))) throw Error("Invalid " + name + " value");
    return name === "player.seek" ? { positionMs: number } : { volume: number };
  }
  if (name === "player.next") {
    if (!value || !["user", "ended", "error"].includes(value.reason) || Object.keys(value).some((key2) => key2 !== "reason" && key2 !== "track")) throw Error("Invalid next operation");
    return { reason: value.reason, ...value.track === void 0 ? {} : { track: track2(value.track) } };
  }
  if (name === "player.pause" || name === "player.resume" || name === "player.previous") {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 0) throw Error("Expected empty playback input");
    return {};
  }
  if (name === "player.play") {
    const index = value?.queueIndex;
    if (index !== void 0 && (!Number.isSafeInteger(index) || index < 0))
      throw Error("Invalid queue index");
    return { track: track2(value?.track), ...index === void 0 ? {} : { queueIndex: index } };
  }
  if (name !== "queue.add" || !["next", "end"].includes(value?.position) || !Array.isArray(value.tracks) || !value.tracks.length || value.tracks.length > 1e3)
    throw Error("Invalid queue operation");
  return { position: value.position, tracks: value.tracks.map(track2) };
}

// packages/core/src/operation-catalog.ts
var text2 = (maxLength, minLength = 0) => ({ type: "string", minLength, maxLength });
var enumeration = (...values) => ({ type: "string", enum: values });
var integer = (maximum = Number.MAX_SAFE_INTEGER) => ({ type: "integer", minimum: 0, maximum });
var object = (properties, optional = []) => ({ type: "object", properties, required: Object.keys(properties).filter((key2) => !optional.includes(key2)), additionalProperties: false });
var array = (items, maxItems = 1e3) => ({ type: "array", items, maxItems });
var nullable = (schema) => ({ anyOf: [schema, { type: "null" }] });
var ref = object({ kind: { const: "track" }, providerId: { ...text2(128, 1), pattern: "^[A-Za-z0-9._-]+$" }, id: text2(512, 1) });
var operationTrackSchema = object({ ref, title: text2(512), metadata: object({ artists: array(text2(256), 32) }) });
var tracks = array(operationTrackSchema);
var playlist = object({ id: text2(256, 1), name: text2(512, 1), location: enumeration("local", "cloud", "both") });
var milliseconds2 = { type: "number", minimum: 0 };
var word = object({ startTimeMs: milliseconds2, endTimeMs: milliseconds2, text: text2(65536), translation: text2(65536), romanization: text2(65536) }, ["translation", "romanization"]);
var subline = object({ text: text2(65536), language: text2(128), words: array(word, 1e4) }, ["language", "words"]);
var line = object({ startTimeMs: milliseconds2, endTimeMs: milliseconds2, text: text2(65536), translation: text2(65536), romanization: text2(65536), translations: array(subline, 16), romanizations: array(subline, 16), words: array(word, 1e4), isBackground: { type: "boolean" }, isDuet: { type: "boolean" } }, ["endTimeMs", "translation", "romanization", "translations", "romanizations", "words", "isBackground", "isDuet"]);
var lyric = nullable(object({ format: { const: "crlyric" }, version: { const: 1 }, track: ref, offsetMs: { type: "number" }, plainText: text2(1048576), lines: array(line, 2e4) }, ["plainText"]));
var resultItem = object({ ref: object({ kind: enumeration("track", "playlist"), providerId: text2(128, 1), id: text2(256, 1) }), title: text2(512), subtitle: text2(512), metadata: object({ artists: array(text2(256), 32) }) }, ["subtitle", "metadata"]);
var empty = object({});
var inputs = {
  "player.play": object({ track: operationTrackSchema, queueIndex: integer() }, ["queueIndex"]),
  "player.pause": empty,
  "player.resume": empty,
  "player.previous": empty,
  "player.next": object({ reason: enumeration("user", "ended", "error"), track: operationTrackSchema }, ["track"]),
  "player.error": object({ track: operationTrackSchema, error: enumeration("resolve", "start", "media", "playback") }),
  "player.queueEnded": object({ tracks }, ["tracks"]),
  "player.seek": object({ positionMs: integer() }),
  "player.setVolume": object({ volume: { type: "number", minimum: 0, maximum: 1 } }),
  "player.setMode": object({ mode: enumeration("sequence", "single", "random") }),
  "player.resolve": object({ track: operationTrackSchema, quality: { ...text2(64), pattern: "^[\\w.-]*$" } }),
  "queue.add": object({ tracks: { ...tracks, minItems: 1 }, position: enumeration("next", "end") }),
  "queue.remove": object({ tracks }),
  "queue.clear": object({ tracks }, ["tracks"]),
  "queue.shuffle": object({ items: tracks }),
  "track.like": object({ track: operationTrackSchema, liked: { type: "boolean" } }),
  "playlist.create": object({ name: text2(512, 1), location: enumeration("local", "cloud") }),
  "playlist.delete": object({ playlist }),
  "playlist.addTracks": object({ playlist, tracks }),
  "playlist.removeTracks": object({ playlist, tracks }),
  "playlist.import": object({ value: text2(4096, 1), importerId: { ...text2(257, 3), pattern: "^[\\w.-]{1,128}:[\\w.-]{1,128}$" } }, ["importerId"]),
  "playlist.export": object({ playlist, format: enumeration("cmpl", "cpl") }),
  "search.query": object({ query: text2(4096, 1), sourceId: { ...text2(128, 1), pattern: "^[\\w.-]+$" }, kinds: { ...array(text2(64, 1), 32), minItems: 1 } }),
  "search.suggest": object({ query: text2(4096, 1), items: array(text2(512, 1), 100) }),
  "search.results": object({ query: text2(4096, 1), sourceId: text2(128, 1), page: object({ kind: enumeration("track", "playlist"), items: array(resultItem, 500) }) }),
  "account.switch": object({ pluginId: text2(128, 1), accountId: text2(128, 1), fromConnectionId: nullable(text2(128, 1)), connectionId: text2(128, 1) }),
  "lyrics.load": object({ track: operationTrackSchema }),
  "lyrics.transform": object({ track: operationTrackSchema, lyric }),
  "download.create": object({ tracks, quality: { ...text2(64, 1), pattern: "^[\\w.-]+$" }, directory: { type: "string", pattern: "^[a-f0-9-]{36}$" } }, ["directory"]),
  "download.filename": object({ track: operationTrackSchema, name: text2(255, 1) }),
  "share.create": object({ track: operationTrackSchema }),
  "link.open": object({ url: { ...text2(8192, 1), format: "uri" }, from: enumeration("paste", "drop", "deeplink") }),
  "notification.show": object({ title: text2(512), body: text2(8192), level: enumeration("info", "success", "warning", "error") }),
  "window.close": empty
};
var operations = { ...PLAYBACK_OPERATIONS, ...RESOLVE_OPERATIONS, ...ACCOUNT_OPERATIONS, ...SEARCH_OPERATIONS, ...LIBRARY_OPERATIONS, ...WINDOW_OPERATIONS, ...LYRIC_OPERATIONS, ...DOWNLOAD_OPERATIONS, ...SHARING_OPERATIONS, ...SYSTEM_OPERATIONS };
var OPERATION_CATALOG = Object.fromEntries(Object.entries(operations).map(([key2, entry]) => {
  const name = key2;
  const outputSchema = name === "player.resolve" ? object({ ok: { type: "boolean" } }) : name.startsWith("lyrics.") ? lyric : name === "share.create" ? nullable(object({ id: text2(4096, 1), url: { ...text2(8192, 1), format: "uri" }, template: text2(16384) }, ["template"])) : { type: "null" };
  return [name, { ...entry, observe: operationEventPermission(name + ":done"), inputSchema: inputs[name], outputSchema }];
}));

// packages/core/src/operation-tools.ts
var object2 = (properties, optional = []) => ({ type: "object", properties, required: Object.keys(properties).filter((key2) => !optional.includes(key2)), additionalProperties: false });
var track3 = object2({ ref: object2({ kind: { const: "track" }, providerId: { type: "string", pattern: "^[A-Za-z0-9._-]{1,128}$" }, id: { type: "string", minLength: 1, maxLength: 512 } }), title: { type: "string", maxLength: 512 }, metadata: object2({ artists: { type: "array", maxItems: 32, items: { type: "string", maxLength: 256 } } }) });
var tools = {
  "player.play": ["\u64AD\u653E\u6307\u5B9A\u6B4C\u66F2", object2({ track: track3 }), "player.control"],
  "player.next": ["\u64AD\u653E\u4E0B\u4E00\u9996", object2({ reason: { const: "user" } }), "player.control"],
  "queue.add": ["\u6DFB\u52A0\u6B4C\u66F2\u5230\u64AD\u653E\u961F\u5217", OPERATION_CATALOG["queue.add"].inputSchema, "player.control"],
  "queue.remove": ["\u4ECE\u64AD\u653E\u961F\u5217\u79FB\u9664\u6B4C\u66F2", OPERATION_CATALOG["queue.remove"].inputSchema, "player.control"],
  "queue.clear": ["\u6E05\u7A7A\u64AD\u653E\u961F\u5217", object2({}), "player.control"],
  "download.create": ["\u521B\u5EFA\u6B4C\u66F2\u4E0B\u8F7D\u4EFB\u52A1", object2({ tracks: { type: "array", items: track3, minItems: 1, maxItems: 100 }, quality: { type: "string", pattern: "^[\\w.-]{1,64}$" }, directory: { type: "string", pattern: "^[a-f0-9-]{36}$" } }, ["directory"]), "downloads.create"],
  "track.like": ["\u8BBE\u7F6E\u6B4C\u66F2\u7684\u6536\u85CF\u72B6\u6001", object2({ track: track3, liked: { type: "boolean" } }), "library.write"],
  "playlist.create": ["\u521B\u5EFA\u6B4C\u5355", OPERATION_CATALOG["playlist.create"].inputSchema, "library.write"],
  "playlist.delete": ["\u5220\u9664\u6B4C\u5355", OPERATION_CATALOG["playlist.delete"].inputSchema, "library.delete"],
  "playlist.addTracks": ["\u6DFB\u52A0\u6B4C\u66F2\u5230\u6B4C\u5355", OPERATION_CATALOG["playlist.addTracks"].inputSchema, "library.write"],
  "playlist.removeTracks": ["\u4ECE\u6B4C\u5355\u79FB\u9664\u6B4C\u66F2", OPERATION_CATALOG["playlist.removeTracks"].inputSchema, "library.delete"],
  "playlist.import": ["\u5BFC\u5165\u6B4C\u5355", OPERATION_CATALOG["playlist.import"].inputSchema, "library.write"],
  "playlist.export": ["\u5BFC\u51FA\u6B4C\u5355", OPERATION_CATALOG["playlist.export"].inputSchema, "library.read"],
  "share.create": ["\u751F\u6210\u6B4C\u66F2\u5206\u4EAB\u94FE\u63A5", object2({ track: track3 }), "sharing.publish"],
  "notification.show": ["\u663E\u793A\u8F6F\u4EF6\u5185\u6587\u5B57\u63D0\u793A", OPERATION_CATALOG["notification.show"].inputSchema, null],
  "link.open": ["\u5904\u7406\u516C\u5F00\u94FE\u63A5", OPERATION_CATALOG["link.open"].inputSchema, "external.open"],
  "window.close": ["\u6309\u7528\u6237\u8BBE\u7F6E\u5173\u95ED\u4E3B\u7A97\u53E3", object2({}), "window.control"],
  "player.pause": ["\u6682\u505C\u64AD\u653E", object2({}), "player.control"],
  "player.resume": ["\u7EE7\u7EED\u64AD\u653E", object2({}), "player.control"],
  "player.previous": ["\u64AD\u653E\u4E0A\u4E00\u9996", object2({}), "player.control"],
  "player.seek": ["\u8DF3\u8F6C\u5230\u6307\u5B9A\u6BEB\u79D2\u4F4D\u7F6E", object2({ positionMs: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER } }), "player.control"],
  "player.setVolume": ["\u8BBE\u7F6E\u97F3\u91CF", object2({ volume: { type: "number", minimum: 0, maximum: 1 } }), "player.control"],
  "player.setMode": ["\u8BBE\u7F6E\u64AD\u653E\u6A21\u5F0F", object2({ mode: { enum: ["sequence", "single", "random"] } }), "player.control"]
};
function operationTool(name) {
  if (typeof name !== "string" || !Object.hasOwn(tools, name)) throw Error("Operation is not callable");
  const key2 = name, [description, inputSchema, permission] = tools[key2];
  return { name: key2, description, inputSchema: structuredClone(inputSchema), outputSchema: structuredClone(OPERATION_CATALOG[key2].outputSchema), permission };
}
function toolResult(name, value) {
  if (name === "share.create") {
    shareResult(name, value);
    return;
  }
  if (value !== null) throw Error("Expected null operation result");
}
function validateToolSchema(schema, value) {
  const invalid = () => {
    throw Error("Invalid operation tool input");
  };
  if ("const" in schema && value !== schema.const) invalid();
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) invalid();
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
    const properties = schema.properties;
    if (schema.required.some((key2) => !Object.hasOwn(value, key2))) invalid();
    for (const [key2, entry] of Object.entries(value)) {
      if (!Object.hasOwn(properties, key2)) invalid();
      validateToolSchema(properties[key2], entry);
    }
  } else if (schema.type === "array") {
    if (!Array.isArray(value) || value.length < Number(schema.minItems ?? 0) || value.length > Number(schema.maxItems ?? Infinity)) return invalid();
    for (const entry of value) validateToolSchema(schema.items, entry);
  } else if (schema.type === "string") {
    if (typeof value !== "string" || value.length < Number(schema.minLength ?? 0) || value.length > Number(schema.maxLength ?? Infinity) || typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) invalid();
  } else if (schema.type === "number" || schema.type === "integer") {
    if (typeof value !== "number" || !Number.isFinite(value) || schema.type === "integer" && !Number.isSafeInteger(value) || value < Number(schema.minimum ?? -Infinity) || value > Number(schema.maximum ?? Infinity)) invalid();
  } else if (schema.type === "boolean" && typeof value !== "boolean") invalid();
}
function toolInput(name, value) {
  validateToolSchema(operationTool(name).inputSchema, value);
  if (isSystemOperation(name)) return systemInput(name, value);
  if (name === "window.close") return windowCloseInput(name, value);
  if (name === "track.like") {
    const input2 = likeInput(name, value);
    if (["private", "local"].includes(input2.track.ref.providerId)) throw Error("Operation requires a public track");
    return input2;
  }
  if (isLibraryOperation(name)) {
    const input2 = libraryInput(name, value);
    if ("tracks" in input2 && input2.tracks.some((track4) => ["private", "local"].includes(track4.ref.providerId))) throw Error("Operation requires a public track");
    return input2;
  }
  if (name === "player.next" && (!value || typeof value !== "object" || !("reason" in value) || value.reason !== "user" || Object.keys(value).length !== 1)) throw Error("Tools may only request a user advance");
  if (name === "player.play" && value && typeof value === "object" && "queueIndex" in value) throw Error("Play tools select a public track, not a queue index");
  if (name === "queue.clear" && (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length)) throw Error("Expected empty queue clear input");
  const input = name === "share.create" ? shareInput(name, value) : name === "download.create" ? downloadInput(name, value) : playbackInput(name, value);
  if (name === "download.create" && "tracks" in input && (!input.tracks?.length || input.tracks.length > 100)) throw Error("Expected 1 to 100 download tracks");
  const selected = "track" in input ? [input.track] : "tracks" in input ? input.tracks ?? [] : [];
  if (selected.some((track4) => track4 && ["private", "local"].includes(track4.ref.providerId))) throw Error("Operation requires a public track");
  return input;
}

// packages/core/src/contract.ts
function externalUrl(data) {
  const url = new URL(data.args?.[0]);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password)
    throw Error("Invalid external URL");
}
function validateImport(data) {
  if (typeof data.requestId !== "string" || !data.requestId || data.requestId.length > 128)
    throw Error("Invalid playlist import requestId");
  assertContentPage({ items: data.items });
}
function viewOperation(kind) {
  return ({ args }, manifest) => {
    const id = args[0];
    const viewId = kind === "state" ? id : manifest.ui?.pages?.find((page) => page.id === id)?.view ?? id;
    const view = manifest.entry.views?.find((item) => item.id === viewId);
    if (!view || kind !== "state" && !view.presentation) throw Error("Unknown or non-overlay view");
    if (kind === "close" && args.length === 1) return;
    if (kind === "open" && args.length === 1) return;
    const value = args[1];
    if (kind === "close" || args.length !== 2 || !value || typeof value !== "object" || Array.isArray(value) || new TextEncoder().encode(JSON.stringify(value)).length > 256 * 1024) throw Error("Invalid view payload");
  };
}
var CONTRACT = {
  "entries.selection": { permission: null, positional: true, validate: ({ args }) => {
    if (args.length) throw Error("entries.selection takes no arguments");
  } },
  "entries.invalidate": { permission: null, positional: true, dedupe: () => "own", validate: ({ args }) => {
    if (args.length) throw Error("entries.invalidate takes no arguments");
  } },
  "music.sources": { permission: "music.read", positional: true, implicitKey: true },
  "music.search": {
    permission: "music.read",
    positional: true,
    keyIndex: 2,
    validate: ({ args }) => assertSearchRequest(args[1])
  },
  "music.suggest": { permission: "music.read", positional: true, keyIndex: 2 },
  "music.hotSearch": { permission: "music.read", positional: true, keyIndex: 1 },
  "music.tracks.resolve": { permission: "music.control", positional: true, keyIndex: 2 },
  "music.tracks.lyrics": { permission: "music.read", positional: true, keyIndex: 1 },
  "music.tracks.artwork": { permission: "music.read", positional: true, keyIndex: 1 },
  "music.playlists.search": {
    permission: "music.read",
    positional: true,
    keyIndex: 2,
    validate: ({ args }) => assertSearchRequest(args[1])
  },
  "music.playlists.categories": { permission: "music.read", positional: true, keyIndex: 1 },
  "music.playlists.list": { permission: "music.read", positional: true, keyIndex: 2 },
  "music.playlists.get": { permission: "music.read", positional: true, keyIndex: 2 },
  "music.charts.list": { permission: "music.read", positional: true, keyIndex: 1 },
  "music.charts.getTracks": { permission: "music.read", positional: true, keyIndex: 2 },
  "music.importers.list": { permission: "music.read", positional: true, implicitKey: true },
  "music.importers.parse": { permission: "music.read", positional: true, keyIndex: 3 },
  "music.play": { permission: "music.control", positional: true, keyIndex: 1 },
  "music.enqueue": { permission: "music.control", positional: true, keyIndex: 2 },
  "services.capabilities.list": { permission: null },
  "services.capabilities.get": { permission: null },
  "services.account.getSession": { permission: "account.profile", keyIndex: 0 },
  "services.account.getProfile": { permission: "account.profile", keyIndex: 0 },
  "services.account.openLogin": { permission: null },
  "services.app.getInfo": { permission: null },
  "services.app.operations.list": { permission: null, validate: ({ args }) => {
    if (args.length) throw Error("Expected no arguments");
  } },
  "services.app.call": { permission: ({ args }) => operationTool(args[0]).permission, keyIndex: 2, validate: ({ args }) => {
    if (args.length !== 3 || typeof args[2]?.permissionKey !== "string" || operationTool(args[0]).permission !== null && !args[2].permissionKey || typeof args[2]?.operation?.id !== "string" || !args[2].operation.id || !Number.isFinite(args[2].operation.deadlineAt)) throw Error("Expected operation name, input and ServiceCall");
    toolInput(operationTool(args[0]).name, args[1]);
  }, validateResult: (value, { args }) => toolResult(operationTool(args[0]).name, value) },
  "services.app.openSettings": { permission: null },
  "services.app.openExternal": { permission: "external.open", keyIndex: 1, validate: externalUrl },
  "services.player.getState": { permission: "player.read", keyIndex: 0 },
  "services.player.play": { permission: "player.control", keyIndex: 1 },
  "services.player.pause": { permission: "player.control", keyIndex: 0 },
  "services.player.next": { permission: "player.control", keyIndex: 0 },
  "services.player.previous": { permission: "player.control", keyIndex: 0 },
  "services.player.seek": { permission: "player.control", keyIndex: 1 },
  "services.player.setVolume": { permission: "player.control", keyIndex: 1 },
  "services.player.setMode": { permission: "player.control", keyIndex: 1 },
  "services.queue.get": { permission: "player.read", keyIndex: 0 },
  "services.queue.append": { permission: "player.control", keyIndex: 1 },
  "services.queue.replace": { permission: "player.control", keyIndex: 1 },
  "services.queue.remove": { permission: "player.control", keyIndex: 1 },
  "services.queue.reorder": { permission: "player.control", keyIndex: 2 },
  "services.favorites.contains": { permission: "library.read", keyIndex: 1 },
  "services.favorites.add": { permission: "library.write", keyIndex: 1 },
  "services.favorites.remove": { permission: "library.write", keyIndex: 1 },
  "services.history.list": { permission: "player.read", keyIndex: 1 },
  "services.downloads.list": { permission: "downloads.manage", keyIndex: 0 },
  "services.downloads.create": { permission: "downloads.create", keyIndex: 1 },
  "services.downloads.pause": { permission: "downloads.manage", keyIndex: 1 },
  "services.downloads.resume": { permission: "downloads.manage", keyIndex: 1 },
  "services.downloads.cancel": { permission: "downloads.manage", keyIndex: 1 },
  "services.downloads.retry": { permission: "downloads.manage", keyIndex: 1 },
  "services.downloads.reveal": { permission: "downloads.manage", keyIndex: 1 },
  "services.files.pick": { permission: null },
  "services.files.pickDirectory": { permission: null },
  "services.files.readText": { permission: "files.read", keyIndex: 1 },
  "services.files.readBase64": { permission: "files.read", keyIndex: 1 },
  "services.files.saveText": { permission: null },
  "services.files.writeText": { permission: "files.write", keyIndex: 2 },
  "services.clipboard.readText": { permission: "clipboard.read", keyIndex: 0 },
  "services.clipboard.writeText": { permission: "clipboard.write", keyIndex: 1 },
  "services.localMusic.list": { permission: "localMusic.read", keyIndex: 1 },
  "services.localMusic.scan": { permission: "localMusic.read", keyIndex: 1 },
  "services.localMusic.getTags": { permission: "localMusic.read", keyIndex: 1 },
  "services.localMusic.writeTags": { permission: "localMusic.write", keyIndex: 2 },
  "services.settings.get": { permission: "settings.read", keyIndex: 1 },
  "services.settings.update": { permission: "settings.write", keyIndex: 1 },
  "services.window.control": { permission: "window.control", keyIndex: 1 },
  "services.hotkeys.register": { permission: "hotkeys.register", keyIndex: 1 },
  "services.hotkeys.unregister": { permission: null, internal: true },
  "services.sharing.create": { permission: "sharing.publish", keyIndex: 1 },
  "services.sharing.revoke": { permission: "sharing.revoke", keyIndex: 1 },
  "services.sharing.resolve": { permission: null },
  "services.rooms.getState": { permission: "rooms.read", keyIndex: 0 },
  "services.rooms.join": { permission: "rooms.control", keyIndex: 1 },
  "services.rooms.leave": { permission: "rooms.control", keyIndex: 0 },
  "services.rooms.requestTrack": { permission: "rooms.control", keyIndex: 1 },
  "services.devices.list": { permission: "devices.control", keyIndex: 0 },
  "services.devices.select": { permission: "devices.control", keyIndex: 1 },
  "services.ai.generate": { permission: "ai.use", keyIndex: 1 },
  "services.tasks.schedule": { permission: "background.run", keyIndex: 1 },
  "services.tasks.cancel": { permission: "background.run", keyIndex: 1 },
  "library.playlists.list": { permission: "library.read" },
  "library.playlists.getTracks": { permission: "library.read", validateResult: assertContentPage },
  "library.playlists.import": {
    permission: "library.write",
    validate: validateImport,
    dedupe: (data) => data.requestId
  },
  "library.playlists.removeTracks": {
    permission: "library.delete",
    validate: (data) => assertRemovableTracks(data.items)
  },
  "library.playlists.clearPlaylist": { permission: "library.delete" },
  "config.get": { permission: null },
  "http.request": { permission: "network.request" },
  "server.start": { permission: "network.serve", implicitKey: true, internal: true, validate: (data, manifest) => {
    if (data.port !== void 0 && (!Number.isInteger(data.port) || data.port < 0 || data.port > 65535)) throw Error("Invalid server port");
    if (data.lan !== void 0 && typeof data.lan !== "boolean") throw Error("Invalid server LAN mode");
    if (data.lan && !manifest.uses?.permissions?.some((row) => row.name === "network.serve.lan")) throw Error("Undeclared LAN server permission");
  } },
  "server.stop": { permission: null, internal: true },
  "permissions.query": { permission: null },
  "permissions.request": { permission: null },
  "permissions.getGranted": { permission: null },
  "permissions.requestGroup": { permission: null },
  "sockets.connect": { permission: "network.socket", internal: true },
  "sockets.send": { permission: null, internal: true },
  "sockets.disconnect": { permission: null, internal: true },
  "storage.get": { permission: null },
  "storage.set": { permission: null },
  "storage.delete": { permission: null },
  "guests.list": { permission: null },
  "guests.import": { permission: "guests.manage" },
  "guests.select": { permission: "guests.manage" },
  "guests.remove": { permission: "guests.manage" },
  "guests.invoke": { permission: "guests.run" },
  "ui.pages.open": { permission: null, positional: true, validate: viewOperation("open") },
  "ui.pages.close": { permission: null, positional: true, validate: viewOperation("close") },
  "ui.views.setState": { permission: null, positional: true, validate: viewOperation("state") },
  "ui.dialogs.confirm": { permission: null },
  "ui.dialogs.prompt": { permission: null },
  "ui.dialogs.pickPlaylist": { permission: null },
  "ui.navigation.open": { permission: null, validate: assertNavigationRequest },
  "accounts.current": { permission: null, internal: true, validate: (data, manifest) => {
    if (!manifest.provides?.accounts?.some((account) => account.id === data.accountId)) throw Error("Unknown account declaration");
  } },
  "accounts.reportExpired": { permission: "credentials.use", implicitKey: true, internal: true, validate: (data, manifest) => {
    if (!manifest.provides?.accounts?.some((account) => account.id === data.accountId)) throw Error("Unknown account declaration");
    if (typeof data.connectionId !== "string" || !data.connectionId || data.connectionId.length > 128 || data.credential?.kind !== "credential" || typeof data.credential.id !== "string" || !data.credential.id || data.credential.id.length > 128) throw Error("Invalid account credential reference");
  } },
  "accounts.form": { permission: null, internal: true, timeoutMs: 12e4 },
  "accounts.qrcode": { permission: null, internal: true, timeoutMs: 305e3 },
  "accounts.oauth": { permission: null, internal: true, timeoutMs: 305e3 },
  "accounts.browser": { permission: null, internal: true, timeoutMs: 305e3 },
  "credentials.get": { permission: "credentials.use", implicitKey: true, internal: true },
  "router.current": { permission: null },
  "router.push": { permission: null, validate: (data, manifest) => {
    validatePluginRouteTarget(data, manifest);
  } },
  "ui.playlistImport.open": { permission: null },
  "ui.pluginUpdate.request": { permission: null },
  "ui.notifications.show": { permission: "notifications.system" },
  "ui.progress.create": { permission: null, positional: true },
  "ui.progress.update": { permission: null, positional: true },
  "ui.progress.close": { permission: null, positional: true },
  "operations.cancel": { permission: null, internal: true },
  "plugins.use": { permission: "services.consume", internal: true, implicitKey: true },
  "plugins.list": { permission: "services.consume", internal: true, implicitKey: true },
  "plugins.invoke": { permission: "services.consume", internal: true, implicitKey: true, timeoutMs: 3e4 },
  "plugins.registerService": { permission: null, internal: true },
  "hooks.register": { permission: null, internal: true },
  "events.register": { permission: null, internal: true },
  "hooks.resolveNext": { permission: "player.intercept", internal: true, implicitKey: true },
  "hooks.next": { permission: "player.intercept", internal: true, implicitKey: true },
  "hooks.accountNext": { permission: "account.intercept", internal: true, implicitKey: true },
  "hooks.windowNext": { permission: "window.intercept", internal: true, implicitKey: true },
  "hooks.lyricsNext": { permission: "lyrics.intercept", internal: true, implicitKey: true },
  "hooks.downloadsNext": { permission: "downloads.intercept", internal: true, implicitKey: true },
  "hooks.sharingNext": { permission: "sharing.intercept", internal: true, implicitKey: true },
  "hooks.linksNext": { permission: "links.intercept", internal: true, implicitKey: true },
  "hooks.notificationsNext": { permission: "notifications.intercept", internal: true, implicitKey: true },
  "hooks.libraryNext": { permission: "library.intercept", internal: true, implicitKey: true },
  "hooks.searchNext": { permission: "search.intercept", internal: true, implicitKey: true },
  "surface.invoke": { permission: null, internal: true }
};
function insert(root, path, value) {
  const parts = path.split(".");
  const leaf = parts.pop();
  let target = root;
  for (const part of parts) target = target[part] ??= /* @__PURE__ */ Object.create(null);
  target[leaf] = value;
}
var names = /* @__PURE__ */ Object.create(null);
for (const method of Object.keys(CONTRACT)) insert(names, method, method);
function createRpcMethods(send) {
  const methods = /* @__PURE__ */ Object.create(null);
  for (const method of Object.keys(CONTRACT)) {
    const entry = CONTRACT[method];
    if (entry.internal) continue;
    const service = method.startsWith("services.");
    insert(
      methods,
      service ? method.slice(9) : method,
      (...args) => send(method, service || entry.positional ? { args } : args[0] ?? {})
    );
  }
  return methods;
}

// packages/core/src/trusted-runtime/protocol.ts
var import_node_crypto = require("node:crypto");
var MAX_MESSAGE_BYTES = 1024 * 1024;
var MAX_PENDING = 64;
var RPC_TIMEOUT_MS = 3e4;
var TrustedChannel = class {
  constructor(token2, transport, request, event, fail, timeout = RPC_TIMEOUT_MS) {
    this.token = token2;
    this.transport = transport;
    this.request = request;
    this.event = event;
    this.fail = fail;
    this.timeout = timeout;
  }
  token;
  transport;
  request;
  event;
  fail;
  timeout;
  pending = /* @__PURE__ */ new Map();
  incoming = /* @__PURE__ */ new Map();
  closed = false;
  window = Date.now();
  received = 0;
  send(value) {
    if (this.closed) return Promise.reject(Error("Trusted IPC is closed"));
    let encoded;
    try {
      encoded = JSON.stringify({ ...value, token: this.token });
      if (Buffer.byteLength(encoded) > MAX_MESSAGE_BYTES) throw Error("Trusted IPC message exceeds limit");
    } catch (error) {
      return Promise.reject(error);
    }
    return new Promise((resolve, reject) => {
      try {
        this.transport(encoded, (error) => error ? reject(error) : resolve());
      } catch (error) {
        reject(error);
      }
    });
  }
  notify(name, data) {
    return this.send({ type: "event", name, data });
  }
  call(name, data) {
    if (this.closed) return Promise.reject(Error("Trusted IPC is closed"));
    if (this.pending.size >= MAX_PENDING) return Promise.reject(Error("Trusted IPC pending limit exceeded"));
    const id = (0, import_node_crypto.randomUUID)();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(Error("Trusted IPC request timed out: " + name));
      }, this.timeout);
      this.pending.set(id, { resolve, reject, timer });
      void this.send({ type: "request", id, name, data }).catch((error) => {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      });
    });
  }
  receive(encoded) {
    if (this.closed) return;
    try {
      if (typeof encoded !== "string" || Buffer.byteLength(encoded) > MAX_MESSAGE_BYTES)
        throw Error("Invalid trusted IPC frame");
      const message = JSON.parse(encoded);
      if (!message || message.token !== this.token) throw Error("Unauthenticated trusted IPC frame");
      if (Date.now() - this.window >= 1e3) {
        this.window = Date.now();
        this.received = 0;
      }
      if (++this.received > 1e3) throw Error("Trusted IPC rate limit exceeded");
      if (message.type === "reply") {
        if (typeof message.id !== "string") throw Error("Invalid trusted IPC reply");
        const call = this.pending.get(message.id);
        if (!call) return;
        this.pending.delete(message.id);
        clearTimeout(call.timer);
        message.error === void 0 ? call.resolve(message.data) : call.reject(Error(String(message.error)));
      } else if (message.type === "request") {
        const { id, name } = message;
        if (typeof id !== "string" || id.length > 128 || typeof name !== "string" || name.length > 128 || this.incoming.has(id) || this.incoming.size >= MAX_PENDING)
          throw Error("Invalid trusted IPC request or capacity exceeded");
        const timer = setTimeout(() => this.fail(Error("Trusted IPC incoming request timed out")), this.timeout);
        this.incoming.set(id, timer);
        void Promise.resolve().then(() => this.request(name, message.data)).then(
          (data) => this.send({ type: "reply", id, data }),
          (error) => this.send({ type: "reply", id, error: String(error instanceof Error ? error.message : error).slice(0, 4096) })
        ).catch((error) => {
          if (!this.closed) this.fail(error);
        }).finally(() => {
          clearTimeout(timer);
          this.incoming.delete(id);
        });
      } else if (message.type === "event" && typeof message.name === "string" && message.name.length <= 128) {
        this.event(message.name, message.data);
      } else throw Error("Invalid trusted IPC message");
    } catch (error) {
      this.fail(error instanceof Error ? error : Error(String(error)));
    }
  }
  close(error = Error("Trusted runtime stopped")) {
    this.closed = true;
    for (const call of this.pending.values()) {
      clearTimeout(call.timer);
      call.reject(error);
    }
    this.pending.clear();
    for (const timer of this.incoming.values()) clearTimeout(timer);
  }
};

// packages/core/src/trusted-runtime/runner.ts
var token = process.env.CERU_TRUSTED_TOKEN;
delete process.env.CERU_TRUSTED_TOKEN;
var parentPort = process.parentPort;
var utility = !!parentPort && !!process.versions.electron;
if (!token || !utility && (!process.send || !process.permission || !process.execArgv.includes("--permission")))
  throw Error("Trusted runner requires an authenticated host transport");
var port;
var booted = false;
var server;
var serverUrl;
var serverPort;
var starting = false;
var closing;
var effects = [];
var callbacks = /* @__PURE__ */ new Map();
var listeners = /* @__PURE__ */ new Map();
var require2 = (0, import_node_module.createRequire)(process.argv[1]);
var channel = new TrustedChannel(
  token,
  (message, done) => {
    if (!utility) {
      process.send(message, done);
      return;
    }
    try {
      if (!port) throw Error("Missing trusted MessagePort");
      port.postMessage(message);
      done();
    } catch (error) {
      done(error instanceof Error ? error : Error(String(error)));
    }
  },
  async (name, data) => {
    if (name === "boot" && !booted) {
      booted = true;
      await boot(data);
      return null;
    }
    if (name === "invoke" && booted) {
      const callback = callbacks.get(data?.target);
      if (!callback || !Array.isArray(data.args)) throw Error("Unknown trusted callback");
      return callback(...data.args);
    }
    throw Error("Unknown trusted runner request");
  },
  (name, data) => {
    if (name === "shutdown") {
      void shutdown();
    } else if (name === "event") {
      for (const listener of listeners.get(data?.name) ?? [])
        void Promise.resolve().then(() => listener(data.data)).catch(fatal);
    } else throw Error("Unknown trusted runner event");
  },
  fatal
);
if (utility) {
  parentPort.on("message", (event) => {
    if (port || event.data?.type !== "ceru-trusted-port" || event.data?.token !== token || event.ports?.length !== 1)
      return fatal(Error("Invalid trusted MessagePort transfer"));
    port = event.ports[0];
    port.on("message", (message) => channel.receive(message.data));
    port.on("close", () => process.exit(0));
    port.start();
    port.postMessage({ type: "ceru-trusted-ready", token });
  });
} else {
  process.on("message", (message) => channel.receive(message));
  process.on("disconnect", () => process.exit(0));
}
process.on("uncaughtException", fatal);
process.on("unhandledRejection", fatal);
function fatal(error) {
  const message = String(error instanceof Error ? error.message : error).slice(0, 4096);
  void channel.notify("failed", { message }).finally(() => process.exit(1));
}
async function closeServer() {
  if (closing) return closing;
  if (!server) return;
  const current = server;
  closing = (async () => {
    server = void 0;
    serverUrl = void 0;
    serverPort = void 0;
    await new Promise((resolve) => {
      current.close(() => resolve());
      current.closeAllConnections();
    });
    await channel.call("server.closed", {});
  })();
  try {
    await closing;
  } finally {
    closing = void 0;
  }
}
async function shutdown() {
  try {
    await closeServer();
    for (const effect of effects.reverse()) await effect();
  } finally {
    process.exit(0);
  }
}
async function bind(current, port2, host) {
  await new Promise((resolve, reject) => {
    const error = (error2) => {
      current.off("listening", listening);
      reject(error2);
    };
    const listening = () => {
      current.off("error", error);
      resolve();
    };
    current.once("error", error);
    current.once("listening", listening);
    current.listen(port2, host);
  });
}
async function boot(data) {
  if (data.platform !== process.platform + "-" + process.arch)
    throw Error("Trusted executable platform does not match the host");
  const permission = process.permission;
  if (utility) {
    if (data.securityMode !== "utility-unrestricted") throw Error("Utility runner requires unrestricted consent");
  } else if (data.securityMode !== "node-permission" || permission.has("child") || permission.has("worker") || permission.has("addon") !== data.native.length > 0)
    throw Error("Trusted runner permission configuration mismatch");
  const manifest = data.manifest;
  const native = new Map(data.native.map((item) => [item.name, item]));
  const nativeFile = (name) => {
    const item = native.get(name);
    if (!item) throw Error("Undeclared native module: " + name);
    const hash = "sha256:" + (0, import_node_crypto2.createHash)("sha256").update((0, import_node_fs.readFileSync)(item.path)).digest("hex");
    if (hash !== item.sha256) throw Error("Extracted native SHA-256 mismatch: " + name);
    return item.path;
  };
  for (const name of native.keys()) nativeFile(name);
  const rpc = (name, value) => channel.call(name, value);
  const services = createRpcMethods(rpc);
  const subscribe = (name, listener) => {
    if (typeof listener !== "function") throw Error("Expected event listener");
    const group = listeners.get(name) ?? /* @__PURE__ */ new Set();
    group.add(listener);
    listeners.set(name, group);
    return () => {
      group.delete(listener);
    };
  };
  const register = (target, handler) => {
    if (callbacks.has(target) || callbacks.size >= 256 || typeof handler !== "function") throw Error("Invalid trusted callback");
    callbacks.set(target, handler);
    return () => {
      callbacks.delete(target);
    };
  };
  const ctx = {
    ...services,
    plugin: { id: manifest.id, version: manifest.version, name: manifest.name },
    // Keep services.config.get(): config is an API, not the manifest defaults.
    permissions: {
      ...services.permissions,
      query: (value) => rpc("permissions.query", typeof value === "string" ? { key: value } : value),
      request: (value) => rpc("permissions.request", typeof value === "string" ? { key: value } : value)
    },
    paths: { data: data.dataDirectory, native: data.nativeDirectory },
    native: { path: nativeFile, load: (name) => require2(nativeFile(name)) },
    effects: { add: (effect) => {
      if (typeof effect !== "function" || effects.length >= 256) throw Error("Invalid cleanup effect");
      effects.push(effect);
    } },
    log: Object.fromEntries(["debug", "info", "warn", "error"].map((level) => [
      level,
      (message, value) => {
        void channel.notify("log", { level, message, data: value }).catch(fatal);
      }
    ])),
    storage: {
      get: (key2) => rpc("storage.get", { key: key2 }),
      set: (key2, value) => rpc("storage.set", { key: key2, value }),
      delete: (key2) => rpc("storage.delete", { key: key2 })
    },
    events: { on: subscribe },
    actions: { register: (id, handler) => {
      if (!manifest.provides?.actions?.some((item) => item.id === id)) throw Error("Undeclared action");
      return register("actions:" + id, handler);
    } },
    server: {
      get url() {
        return serverUrl;
      },
      get port() {
        return serverPort;
      },
      async listen(listener, options = {}) {
        if (typeof listener !== "function" || server || starting || closing) throw Error("Only one trusted server is allowed");
        starting = true;
        let current;
        try {
          const approved = await channel.call("server.authorize", options);
          current = (0, import_node_http.createServer)(listener);
          try {
            await bind(current, approved.port, approved.host);
          } catch (error) {
            if (!approved.port || error.code !== "EADDRINUSE") throw error;
            await bind(current, 0, approved.host);
          }
          const address = current.address();
          if (!address || typeof address === "string") throw Error("Missing trusted server address");
          const port2 = address.port;
          const url = "http://127.0.0.1:" + port2;
          await channel.call("server.register", { port: port2, host: approved.host, url });
          server = current;
          serverPort = port2;
          serverUrl = url;
          current.on("error", fatal);
          const owned = current;
          return { port: port2, url, close: () => server === owned ? closeServer() : Promise.resolve() };
        } catch (error) {
          current?.close();
          current?.closeAllConnections();
          throw error;
        } finally {
          starting = false;
        }
      }
    }
  };
  services.music.on = (event, listener) => {
    if (event !== "sources.changed") throw Error("Unknown music event");
    return subscribe("music.sources.changed", listener);
  };
  const entry = (0, import_node_module.createRequire)(data.entryPath)(data.entryPath);
  if (typeof entry !== "function") throw Error("Trusted server must export a function");
  const dispose = await entry(ctx);
  if (typeof dispose === "function") effects.push(dispose);
}
