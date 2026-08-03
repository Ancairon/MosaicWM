// Copyright 2025-2026 Cleo Menezes Jr.
// SPDX-License-Identifier: GPL-2.0-or-later
// Custom layout strategy to preserve mosaic geometry in Overview

import * as Workspace from 'resource:///org/gnome/shell/ui/workspace.js';
import { ComputedLayouts } from './mosaicModel.js';
import { WINDOW_SPACING } from './constants.js';

const OVERVIEW_SHRINK_FACTOR = 0.88;
const SACRED_OVERVIEW_SHRINK_FACTOR = 0.64;

// Overview clones expose the window directly or behind .source depending on where the
// shell built them, so never reach for .metaWindow on its own.
function metaWindowOf(clone) {
    return clone.metaWindow || clone.source?.metaWindow;
}

function overlaps(a, b, gap) {
    return a.x < b.x + b.width + gap &&
        a.x + a.width + gap > b.x &&
        a.y < b.y + b.height + gap &&
        a.y + a.height + gap > b.y;
}

function clampSlot(slot, bounds) {
    return {
        ...slot,
        x: Math.max(bounds.x, Math.min(bounds.x + bounds.width - slot.width, slot.x)),
        y: Math.max(bounds.y, Math.min(bounds.y + bounds.height - slot.height, slot.y)),
    };
}

function findFreeSlot(slot, placed, bounds, gap) {
    const clamped = clampSlot(slot, bounds);
    if (!placed.some(other => overlaps(clamped, other, gap)))
        return clamped;

    const step = Math.max(1, Math.round(gap));
    const maxDx = Math.max(0, bounds.width - clamped.width);
    const maxDy = Math.max(0, bounds.height - clamped.height);
    const maxRadius = Math.max(
        1,
        Math.ceil(Math.max(maxDx, maxDy) / step)
    );

    for (let radius = 1; radius <= maxRadius; radius++) {
        const offsets = [
            [radius, 0],
            [-radius, 0],
            [0, radius],
            [0, -radius],
            [radius, radius],
            [radius, -radius],
            [-radius, radius],
            [-radius, -radius],
        ];

        for (const [dx, dy] of offsets) {
            const candidate = clampSlot({
                ...slot,
                x: clamped.x + dx * step,
                y: clamped.y + dy * step,
            }, bounds);
            if (!placed.some(other => overlaps(candidate, other, gap)))
                return candidate;
        }
    }

    return clamped;
}

// Scales down the layout instead of reorganizing windows (preserves spatial memory)
export class MosaicLayoutStrategy extends Workspace.LayoutStrategy {
    constructor(props) {
        super(props);
        this._calculating = false;
    }

    computeLayout(windows, _params) {
        return { windows };
    }

    computeWindowSlots(layout, area) {
        const clones = layout.windows;

        if (!area || clones.length === 0) {
            return [];
        }

        // layout.windows already contains only the windows GNOME Shell decided belong in
        // the overview (_sortedWindows). No further filtering is needed: dropping any window
        // here would leave its clone unallocated, making it stay at (0,0) and visually
        // overlap with tiled window thumbnails.
        const workspace = this._firstWorkspace(clones);
        if (!workspace) return [];

        const monitor = this.monitor || this._monitor;
        const monitorIndex = monitor ? monitor.index : global.display.get_primary_monitor();
        const workArea = workspace.get_work_area_for_monitor(monitorIndex);

        if (!workArea || workArea.width <= 0 || workArea.height <= 0) {
            return [];
        }

        const scale = Math.min(area.width / workArea.width, area.height / workArea.height, 1.0);

        const offsetX = (area.width - (workArea.width * scale)) / 2;
        const offsetY = (area.height - (workArea.height * scale)) / 2;

        return this._buildSlots(clones, { workArea, area, scale, offsetX, offsetY });
    }

    _firstWorkspace(clones) {
        for (const clone of clones) {
            const mw = metaWindowOf(clone);
            const workspace = mw?.get_workspace();
            if (workspace) return workspace;
        }
        return null;
    }

    _buildSlots(clones, { workArea, area, scale, offsetX, offsetY }) {
        const gap = WINDOW_SPACING / 2;
        const bounds = {
            x: area.x + gap,
            y: area.y + gap,
            width: Math.max(1, area.width - gap * 2),
            height: Math.max(1, area.height - gap * 2),
        };
        const slots = [];
        const placed = [];

        // Sacred (maximized/fullscreen) windows sort first, so their clones are added to
        // the actor tree first and paint behind the rest of the Mosaic thumbnails.
        const orderedClones = [...clones].sort((a, b) => {
            const aWindow = metaWindowOf(a);
            const bWindow = metaWindowOf(b);
            const aSacred = aWindow && (aWindow.is_maximized() || aWindow.is_fullscreen());
            const bSacred = bWindow && (bWindow.is_maximized() || bWindow.is_fullscreen());

            if (aSacred !== bSacred)
                return aSacred ? -1 : 1;

            return 0;
        });

        for (const clone of orderedClones) {
            const mw = metaWindowOf(clone);
            if (!mw) continue;

            // The mosaic's computed layout beats the live frame; mid-animation the frame is
            // a transient size and the overview would mirror the blur. Sacred windows have
            // no mosaic slot, so they always read their live frame.
            const isSacred = mw.is_maximized() || mw.is_fullscreen();
            const rect = isSacred
                ? mw.get_frame_rect()
                : (ComputedLayouts.get(mw) || mw.get_frame_rect());
            if (!rect) continue;

            // Formula: (DesktopPos - DesktopOrigin) * Scale + OverviewSlotOrigin + CenteringOffset
            // Then shrink the mirrored thumbnail slightly and resolve collisions so
            // the custom overview never leaves windows stacked on top of each other.
            const mirroredWidth = Math.max(1, rect.width * scale);
            const mirroredHeight = Math.max(1, rect.height * scale);
            const shrinkFactor = isSacred
                ? SACRED_OVERVIEW_SHRINK_FACTOR
                : OVERVIEW_SHRINK_FACTOR;
            const w = Math.max(1, mirroredWidth * shrinkFactor - gap * 2);
            const h = Math.max(1, mirroredHeight * shrinkFactor - gap * 2);
            const x = (rect.x - workArea.x) * scale + area.x + offsetX + (mirroredWidth - w) / 2;
            const y = (rect.y - workArea.y) * scale + area.y + offsetY + (mirroredHeight - h) / 2;
            const slot = findFreeSlot({ x, y, width: w, height: h }, placed, bounds, gap);

            placed.push(slot);
            slots.push([slot.x, slot.y, slot.width, slot.height, clone]);
        }

        return slots;
    }
}
