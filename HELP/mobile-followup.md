# Mobile layout follow-up

Please review the latest Discord Bot Manager mobile changes in `devApps/discord-manager/public/style.css` and `public/app.js` against `mobile-review.md`.

Check whether the invite flow is reachable on phone widths, whether channel rows are compact without causing overflow, whether focus is preserved after add/remove/type changes, and whether the `.sidebar-note` selector fix keeps the server strip compact. Look for any remaining high-impact mobile usability issue. Do not edit app files; append findings to `mobile-review.md` and report the result.

## Implementation update

The user expanded this review into a phone-first polish task and authorized app changes. The invite action, compact editor sections, open-details/focus/scroll preservation, and phone server strip behavior were already in place. The remaining source-review issues were a narrow channel-type select and invisible-but-focusable bottom tabs.

Current changes give the channel type a full-width touch target, truncate long server names within scrollable server chips, keep layout save/apply actions available above the fixed section bar while scrolling, and hide that bar from keyboard navigation while an editor field is focused. The 320–430px layout and keyboard/safe-area behavior still need device/browser inspection.

The repository has no Discord Manager-specific test suite. Run the existing Node test suite and docs check before calling this complete.
