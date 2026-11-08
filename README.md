# Mosaic WM

> 📣 **Development journal on Mastodon:** [floss.social/@CleoMenezesJr](https://floss.social/@CleoMenezesJr/115606214788777474)
>
> 📣 **Testers room on Matrix:** [#mosaicwm:matrix.org](https://matrix.to/#/%23mosaicwm:matrix.org)

A GNOME Shell extension that tiles windows automatically in a mosaic layout.

It is also a testbed. The point is not to maintain an extension indefinitely, but to work out what mosaic tiling should actually do in daily use, in enough detail that the model can be proposed to Mutter and GNOME Shell. An extension is the fastest way to put the idea in front of real users and find out where it falls apart.

## Project status

Early, and moving fast. Behaviour changes between commits, and something that worked last week may not work today.

- Requires **GNOME Shell 50**. Earlier versions are not supported.
- Wayland is the target session.
- Code contributions are unlikely to be accepted right now. See [Contributing](#contributing).

## Design goals

The starting point is Tobias Bernard's [Rethinking Window Management](https://blogs.gnome.org/tbernard/2023/07/26/rethinking-window-management/). That post is the premise, not the specification. It describes the shape of the idea; this project is where the idea meets actual use, and where usability testing gets to overrule the original sketch.

Two places the design has already been pushed further than the post:

- **Miniatures are first-class members of the mosaic.** When a workspace fills up, the least recently used window shrinks into a small live thumbnail and stays on screen, clickable, instead of being exiled to another workspace. Overflow to a new workspace is the fallback, not the first move.
- **Quarter tiling as a general region model.** Halves and quarters are not special cases bolted onto the mosaic; they are regions the mosaic packs into. This is also the part most likely to be useful upstream, independent of the rest.

The consistent principle behind both: nothing should require the user to think about window management. If a behaviour needs explaining before it makes sense, that is a defect in the behaviour, not a gap in the documentation.

## Features

- Automatic mosaic layout using a radial packing algorithm
- Miniature thumbnails when a workspace runs out of room, in most-recently-used order; click one to restore it
- Overflow to another workspace for windows that cannot shrink any further
- Edge tiling to halves and quarters by dragging to a screen edge, with consistent half-spacing screen margins and the remaining windows adapting to what is left
- Window swapping by dragging one window onto another
- Move the focused window around the mosaic grid with `Super+Left/Right` and `Super+Alt+Up/Down`
- Walk the focused window through its tiling stack with `Super+Up/Down`: trade places with a quarter partner, maximize off the top, return to the mosaic off the bottom
- Cycle the focused window's width/height through 5% presets with `Super+W/A/S/D`, wrapping at both ends
- Fullscreen and maximized windows stay on their current workspace instead of being isolated to a dedicated one; in the Overview they are kept behind the other Mosaic thumbnails
- Windows grow back toward their preferred size when neighbours close or miniaturize
- Quick Settings toggles for mosaic per workspace and globally, with a top bar indicator
- Miniatures keep their scale and position across the Overview

## Known limitations

- **Touch drag does not tile.** Mutter does not expose the drag position to extensions, so the extension cannot tell where your finger is. It currently detects touch drags and skips edge tiling rather than guessing wrong. Fixing it properly needs a small addition to Mutter.
- **Multi-monitor needs a specific setting.** It requires *Workspaces on all displays* (Settings → Multitasking). *Workspaces on primary display only* is not supported yet ([#30](https://github.com/CleoMenezesJr/MosaicWM/issues/30)).
- **No preferences UI.** Keyboard shortcuts can only be changed with `gsettings`. Quick Settings covers the mosaic toggles and nothing else. This is deliberate for now, see below.
- Drag and drop inside the Overview has rough edges.
- The edge tiling overflow preview is not animated.

## Where this is going

Roughly in priority order.

1. **Getting the default behaviour right, before adding any preferences.** A preference added too early freezes a decision that was never validated, and turns a design question into a support burden. Which knobs deserve to exist is something the testing should tell us, not something to guess at up front.
2. **Real multi-monitor support**, including *Workspaces on primary display only*, so the feature can stop being labelled experimental.
3. **Touch support**, which needs a small addition to Mutter: a way for extensions to read the position of an in-progress window drag. Mutter already tracks the number internally; it just is not reachable from JavaScript.
4. **The region model in Mutter, and the mosaic itself in GNOME Shell.** This is the actual destination. The extension exists to make the case with something people have used.
5. **Preferences in GNOME Settings**, not in an extension preferences window, and only after point 1.

## Installation

```bash
git clone https://github.com/CleoMenezesJr/MosaicWM.git
cd MosaicWM
./scripts/build.sh -i
```

The install script reloads the extension in-session when it is already enabled.
If your current GNOME Shell session still shows stale behavior after install, log out and log back in as a fallback.

### Manual Installation

1. Download the latest release from GitHub
2. Extract to `~/.local/share/gnome-shell/extensions/mosaicwm@cleomenezesjr.github.io/`
3. **Disable debug logging**: Edit `extension/logger.js` and set `const DEBUG = false;`
4. Enable via Extensions app or: `gnome-extensions enable mosaicwm@cleomenezesjr.github.io`
5. If the current session still shows stale behavior, restart GNOME Shell by logging out and back in

## Usage

There is nothing to configure. Once enabled:

- **Open windows**: They'll be automatically tiled
- **Drag windows**: Click and drag to reorder, or to a screen edge for half/quarter tiling
- **Swap windows**: Drag a window onto another to swap their positions
- **Grid movement**: `Super+Left`, `Super+Right`, `Super+Alt+Up`, and `Super+Alt+Down` move the focused window toward the neighboring grid slot when one exists
- **Tiling stack**: `Super+Up` swaps a bottom quarter with the quarter above it, or maximizes; `Super+Down` swaps a top quarter with the one below it, unmaximizes, or returns a tiled window to the mosaic
- **Keyboard resize**: `Super+D` cycles width up, `Super+A` cycles width down, `Super+W` cycles height up, and `Super+S` cycles height down through 5% presets from 5% to 100% of the usable tiling area, wrapping at both ends
- **Maximize/Fullscreen**: Window stays on its current workspace; in Overview it is kept behind the other Mosaic thumbnails
- **Minimize**: Window is excluded from tiling
- **Too many windows**: Extra windows shrink into small thumbnails. Click one to bring it back to focus

## Development

```bash
npm install            # the pre-commit hook shells out to npx eslint
./scripts/setup-hooks  # symlinks .git/hooks/pre-commit, per clone
```

`./scripts/build.sh -i` reloads the extension in-session when it is already enabled. Use a full log out/log back in only if the running shell still keeps stale code after reinstall.

### Enable Debug Logging

Debug logging is enabled by default for development. To enable verbose debug logs, edit `extension/logger.js` and set:

```javascript
const DEBUG = true;
```

> [!TIP]
> For production/installation, set `DEBUG = false` to reduce CPU usage.

### Debugging

For debugging and development tips, see the [GJS Extension Development Guide](https://gjs.guide/extensions/development/debugging.html).

View logs in real-time:

```bash
journalctl -f -o cat /usr/bin/gnome-shell | grep -i mosaic
```

Looking Glass (<kbd>Alt</kbd>+<kbd>F2</kbd> → `lg`) shows extension errors under its Extensions tab. The [GJS debugging guide](https://gjs.guide/extensions/development/debugging.html) covers the rest.

## Contributing

Most pull requests will be turned down right now. The internals get rewritten often enough that a patch can collide with a refactor before anyone reviews it, and declining good work for that reason wastes your time and mine. Something small and self-contained can still land, so open an issue and ask before writing it. This gets easier once the architecture settles.

What genuinely helps in the meantime:

- **Testing.** Use it as your daily driver and push on the edge cases. This is the single most useful thing anyone can do, given the whole point is finding out where the design breaks under real use.
- **Bug reports** with reproduction steps, your GNOME Shell version, and your monitor setup.
- **Design feedback.** Disagreement about how a behaviour *should* work is more valuable here than a patch that implements it.

Anything that does eventually land must satisfy the [GNOME Shell Extensions Review Guidelines](https://gjs.guide/extensions/review-guidelines.html).

## Support

This is unfunded work on a problem that will take a long time to finish properly. If you would like it to keep going, sponsorship is what makes the time available:

[<img src="https://raw.githubusercontent.com/CleoMenezesJr/flatline/1e3b5252c5955d8918a7751aea854a830616d696/other/promotion/badges/donate_paypal.svg" height=29px alt="PayPal donation">](https://www.paypal.com/donate/?hosted_button_id=7KDCH44AMMCS2)
[<img src="https://ko-fi.com/img/githubbutton_sm.svg" height=29px alt="Ko-fi">](https://ko-fi.com/cleomenezesjr)
[<img src="https://img.shields.io/github/sponsors/CleoMenezesJr?logo=githubsponsors&label=Sponsor" height=29px alt="GitHub Sponsors">](https://github.com/sponsors/CleoMenezesJr)

## Acknowledgments

- [heikkiket/window-mosaic-mode](https://gitlab.gnome.org/heikkiket/window-mosaic-mode), which first showed the idea was worth chasing
- [Tobias Bernard](https://blogs.gnome.org/tbernard/2023/07/26/rethinking-window-management/), for the vision the design argues with
- Everyone testing this and filing the awkward bugs

## License

GNU General Public License v2.0 or later, the same license as Mutter and GNOME Shell. See [LICENSE](LICENSE).
