# Discord Bot Manager mobile review

Reviewed `devApps/discord-manager/public/index.html`, `style.css`, and relevant rendering/event code in `app.js`, with narrow-phone behavior in mind (including 390 px and below). No application code was changed.

## Initial findings and current status

- **Invite flow disappeared on phones — resolved.** Initially, `.invite-menu-button` was hidden at `max-width: 600px` and the alternate link was inside `.sidebar-note`, hidden at `max-width: 760px`. The latest CSS shows the invite button again on phones.
- **Layout edits could lose scroll context — mostly resolved.** `renderCategories()` still replaces the categories subtree, but it now restores page/panel scroll offsets and restores focus when changing a channel type. Add/remove actions still discard focus; see follow-up notes below.

## Mobile fit and usability recommendations

- **Use the actual header height for the sticky server strip.** The strip uses `top: calc(57px + safe-area-inset-top)` while the sticky topbar has variable content height and a safe-area-inclusive top padding. At narrow widths, status text and actions can change the header height, leaving a gap or overlap. Measure a 320/360/390 px viewport with a notch and derive the offset from a shared fixed header size, or let the strip follow the header in a single sticky container.
- **Reduce vertical bulk in category/channel editing.** The phone rules stack category name, “+ Channel”, and “Remove”; each channel’s name, type, description, optional tags, and delete control are also full-width stacked fields. This avoids horizontal overflow but makes even a small layout very tall. Keep the channel name and type together, use a compact labeled delete action, and consider a collapsed “description / advanced” area for topic, forum tags, and access overrides.
- **Improve 320–360 px header fit.** The title, connection status, token button, and refresh/server controls compete for width; the `max-width:360px` title cap does not guarantee the flex row can shrink enough. Check 320 px with long server names and “Connecting…”/error status. Allow status to wrap or move it below the title, and keep primary controls at least 44 px where practical.
- **Check fixed bottom tabs against focused fields and the keyboard.** Workspace bottom padding is 90 px plus the safe area, which appears intended to clear the fixed tabs. Verify on iOS/Android when the keyboard opens and when the page is scrolled to the final controls; fixed bars can consume much of the usable height. Consider hiding the tabs while a text field is focused if they cover the editor.
- **Dialogs are sensibly bottom-sheet styled and include bottom safe-area padding.** Verify keyboard-open behavior and ensure the close control remains reachable when the sheet reaches its `88dvh` cap, especially with the invite form’s feedback and authorization link.

## Overall

The narrow layout already adds large touch targets, single-column fields, a thumb-reachable fixed section bar, and bottom-sheet dialogs while retaining the desktop theme. The initial review's main invite blocker is resolved. The biggest remaining day-to-day friction is the tall category editor.

## Follow-up review

The latest mobile changes address the three requested checks:

- **Invite flow:** reachable on phone widths. The invite button is shown again at `max-width: 600px`; it opens the existing invite dialog. It is in the topbar, so it scrolls away during long editing sessions, but the user can reach it again by returning to the top.
- **Channel row fit:** substantially more compact. Name, type, and delete sit on one grid row; description and forum tags use full-width rows below. Grid tracks use `minmax(0, …)` and form controls already have `min-width: 0`, so I see no obvious horizontal overflow at 320–390 px from the CSS. This still merits a real-device check for native select rendering.
- **Changing channel type:** scroll and focus are restored. The type select is tagged, refocused with `preventScroll`, and both page and panel scroll offsets are restored after rerender.

Add/remove focus restoration has also been addressed: adding a category, channel, or role focuses its new name field, while removals focus the nearest remaining item. Reordering a role keeps focus on that role. Scroll position is restored after each render.

I found no remaining high-impact phone-width defect in the requested areas from source inspection. I did not run a browser/device simulation, so keyboard-open, safe-area, and native-select behavior remain unverified.

## Final source review

- The phone header’s “Invite bot” button remains visible at `max-width: 600px` and opens the invite dialog. `.sidebar-note` is hidden with `.server-note` at `max-width: 760px`, keeping the server strip compact without removing the header action.
- Category/channel/role add and remove now focus a sensible item; role reordering and channel-type changes keep focus on the edited item. The render functions restore page and panel scroll offsets after rerendering.
- The channel row uses constrained grid tracks and a full-width description row. No apparent horizontal overflow at 320–390 px from source inspection; native select rendering still needs device verification.
- No remaining high-impact source-level issue found. Real-device keyboard-open, safe-area, and native-select behavior remains unverified.

Keyboard-open and safe-area behavior remain unverified on an actual device.

## Phone-first polish follow-up — 2026-10-23

An additional narrow-screen source audit found that the text Delete button left the channel type select too narrow at 320 px. It also found that the bottom tabs became transparent and pointer-inert while editing but stayed keyboard-focusable. The mobile stylesheet now gives the type select a full-width row, truncates long server names inside horizontally scrollable chips, keeps layout save/apply actions docked above the bottom tabs while browsing, and sets the hidden tabs to `visibility:hidden` while an editor field has focus. The save/apply dock becomes static while typing so it does not cover the field or keyboard.

Validation: `node --test` passed all 63 tests; `npm run docs:check` passed both documentation checks; `node --check devApps/discord-manager/public/app.js` and `git diff --check` completed without errors. These tests do not render the Discord Manager at phone widths. Native select appearance, dynamic safe areas, and keyboard viewport behavior still require a real phone check.
