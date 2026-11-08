// Copyright 2025-2026 Cleo Menezes Jr.
// SPDX-License-Identifier: GPL-2.0-or-later
// Window swapping logic

import * as Logger from './logger.js';
import { TileZone, ZONE_VERTICAL_PAIR } from './constants.js';
import * as WindowState from './windowState.js';
import { monotonicNow } from './timing.js';

import GObject from 'gi://GObject';

// Which axis each direction travels on, and which way "closer" runs on it.
const DIRECTION_RULES = Object.freeze({
    left: { axis: 'x', sign: -1 },
    right: { axis: 'x', sign: 1 },
    up: { axis: 'y', sign: -1 },
    down: { axis: 'y', sign: 1 }
});

function centerOf(frame) {
    return { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
}

// A horizontal move only counts windows sharing rows, a vertical one columns.
function overlapsOnCrossAxis(a, b, axis) {
    if (axis === 'x') return !(a.y + a.height <= b.y || b.y + b.height <= a.y);
    return !(a.x + a.width <= b.x || b.x + b.width <= a.x);
}

// Positive means the candidate really sits that way from the origin.
function signedDistance(origin, center, rule) {
    return (center[rule.axis] - origin[rule.axis]) * rule.sign;
}

export const SwappingManager = GObject.registerClass({
    GTypeName: 'MosaicSwappingManager',
}, class SwappingManager extends GObject.Object {
    _init() {
        super._init();
        this._tilingManager = null;
        this._edgeTilingManager = null;
    }


    setTilingManager(manager) {
        this._tilingManager = manager;
    }

    setEdgeTilingManager(manager) {
        this._edgeTilingManager = manager;
    }

    _findClosestMosaicInDirection(window, mosaicWindows, direction) {
        const rule = DIRECTION_RULES[direction];
        if (!rule) return null;

        const windowFrame = window.get_frame_rect();
        const origin = centerOf(windowFrame);

        const candidates = mosaicWindows.filter(w => {
            if (w.get_id() === window.get_id()) return false;

            const frame = w.get_frame_rect();
            if (!overlapsOnCrossAxis(windowFrame, frame, rule.axis)) return false;

            return signedDistance(origin, centerOf(frame), rule) > 0;
        });

        if (candidates.length === 0) return null;

        let closest = candidates[0];
        let minDistance = Infinity;

        for (const candidate of candidates) {
            const distance = signedDistance(origin, centerOf(candidate.get_frame_rect()), rule);
            if (distance < minDistance) {
                minDistance = distance;
                closest = candidate;
            }
        }

        return { window: closest, zone: null, type: 'mosaic' };
    }

    // Plain Super+Arrow: grid movement only. Edge-tiled windows ignore this entirely, and
    // it never creates or expands a tile zone — that's drag/edge-tiling's job, not this one's.
    moveWindowInGrid(window, direction) {
        if (!this._edgeTilingManager || !this._tilingManager)
            return false;

        const workspace = window.get_workspace();
        const monitor = window.get_monitor();
        const windowState = this._edgeTilingManager.getWindowState(window);
        if (windowState && windowState.zone !== TileZone.NONE) {
            Logger.log(`Grid move ignored for edge-tiled window ${window.get_id()} direction=${direction}`);
            return false;
        }

        // Hysteresis: prevent rapid oscillation of the neighbor swap below.
        const lastMove = WindowState.get(window, 'lastSwapTime');
        if (lastMove && (monotonicNow() - lastMove) < 500) {
            Logger.log(`Grid move throttled for window ${window.get_id()}`);
            return false;
        }

        const mosaicWindows = this._edgeTilingManager.getNonEdgeTiledWindows(workspace, monitor);
        const neighbor = this._findClosestMosaicInDirection(window, mosaicWindows, direction);
        if (!neighbor?.window) {
            Logger.log(`No mosaic neighbor found for window ${window.get_id()} direction=${direction}`);
            return false;
        }

        return this._swapMosaicWindows(window, neighbor.window, workspace, monitor);
    }

    swapWindows(draggedWindow, targetWindow, targetZone, workspace, monitor) {
        if (!this._edgeTilingManager) return false;

        Logger.log(`DnD Swap: ${draggedWindow.get_id()} → zone ${targetZone}`);

        if (draggedWindow.get_id() === targetWindow.get_id()) return false;

        const draggedState = this._edgeTilingManager.getWindowState(draggedWindow);
        const isDraggedTiled = draggedState && draggedState.zone !== TileZone.NONE;

        if (isDraggedTiled) {
            return this._swapTiledWindows(draggedWindow, draggedState.zone, targetWindow, targetZone, workspace, monitor);
        } else {
            return this._swapMosaicWithTiled(draggedWindow, targetWindow, targetZone, workspace, monitor);
        }
    }

    _swapMosaicWindows(window1, window2, workspace, monitor) {
        if (!this._tilingManager) return false;

        Logger.log(`Swapping mosaic windows: ${window1.get_id()} ↔ ${window2.get_id()}`);

        const id1 = window1.get_id();
        const id2 = window2.get_id();

        this._tilingManager.setTmpSwap(id1, id2);
        this._tilingManager.applyTmpSwap(workspace);
        this._tilingManager.clearTmpSwap();
        this._tilingManager.invalidateLayoutCache();
        this._tilingManager.tileWorkspaceWindows(workspace, null, monitor, false);
        WindowState.set(window1, 'lastSwapTime', monotonicNow());
        WindowState.set(window2, 'lastSwapTime', monotonicNow());
        return true;
    }

    _swapMosaicWithTiled(mosaicWindow, tiledWindow, tiledZone, workspace, monitor) {
        if (!this._edgeTilingManager) return false;

        Logger.log(`Swapping mosaic ${mosaicWindow.get_id()} with tiled ${tiledWindow.get_id()}`);

        this._edgeTilingManager.removeTile(tiledWindow);

        const workArea = workspace.get_work_area_for_monitor(monitor);
        this._edgeTilingManager.applyTile(mosaicWindow, tiledZone, workArea, true);

        WindowState.set(mosaicWindow, 'lastSwapTime', monotonicNow());
        WindowState.set(tiledWindow, 'lastSwapTime', monotonicNow());
        return true;
    }

    _swapTiledWithMosaic(tiledWindow, tiledZone, mosaicWindow, workspace, monitor) {
        return this._swapMosaicWithTiled(mosaicWindow, tiledWindow, tiledZone, workspace, monitor);
    }

    _swapTiledWindows(window1, zone1, window2, zone2, workspace, monitor) {
        if (!this._edgeTilingManager) return false;

        Logger.log(`Swapping tiled windows: ${window1.get_id()} ↔ ${window2.get_id()}`);

        const workArea = workspace.get_work_area_for_monitor(monitor);
        this._edgeTilingManager.applyTile(window1, zone2, workArea);
        this._edgeTilingManager.applyTile(window2, zone1, workArea);

        WindowState.set(window1, 'lastSwapTime', monotonicNow());
        WindowState.set(window2, 'lastSwapTime', monotonicNow());

        return true;
    }

    // Target of the Super+Up/Down stack walk when a quarter has a partner above or below;
    // resolveArrowIntent only asks for this once that partner is known to exist.
    swapVerticalQuarterPair(window, direction) {
        if (!this._edgeTilingManager) return false;

        const zone = this._edgeTilingManager.getWindowState(window)?.zone;
        const pairZone = ZONE_VERTICAL_PAIR[zone];
        if (!pairZone) return false;

        const lastSwap = WindowState.get(window, 'lastSwapTime');
        if (lastSwap && (monotonicNow() - lastSwap) < 500) {
            Logger.log(`Quarter swap throttled for window ${window.get_id()}`);
            return false;
        }

        const workspace = window.get_workspace();
        const monitor = window.get_monitor();
        const partner = this._edgeTilingManager.getEdgeTiledWindows(workspace, monitor)
            .find(w => w.zone === pairZone);
        if (!partner) {
            Logger.log(`No quarter partner for window ${window.get_id()} direction=${direction}`);
            return false;
        }

        return this._swapTiledWindows(window, zone, partner.window, pairZone, workspace, monitor);
    }

    _tileToEmptyZone(window, zone, workspace, monitor) {
        if (!this._edgeTilingManager) return false;

        Logger.log(`Tiling window ${window.get_id()} to empty zone ${zone}`);
        const workArea = workspace.get_work_area_for_monitor(monitor);
        this._edgeTilingManager.applyTile(window, zone, workArea);
        WindowState.set(window, 'lastSwapTime', monotonicNow());
        return true;
    }

    _expandQuarterToFull(window, _currentZone, targetZone, workspace, monitor) {
        if (!this._edgeTilingManager) return false;

        Logger.log(`Expanding quarter tile ${window.get_id()} to ${targetZone}`);
        const workArea = workspace.get_work_area_for_monitor(monitor);
        this._edgeTilingManager.applyTile(window, targetZone, workArea);
        WindowState.set(window, 'lastSwapTime', monotonicNow());
        return true;
    }

    destroy() {
        this._tilingManager = null;
        this._edgeTilingManager = null;
    }
});
