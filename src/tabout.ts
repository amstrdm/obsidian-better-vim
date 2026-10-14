import { EditorSelection, Extension, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";

/**
 * Runtime configuration for the tab-out feature.
 * */
export type TaboutConfig = {
    /** Active or not. */
    enabled: boolean;
    /** Whether Shift-Tab should tab back in (jump before the opening char). */
    shiftTab: boolean;
    /** Only act while in vim insert mode. */
    insertModeOnly: boolean;
    /** Characters Tab jumps past (searched to the right, on the current line). */
    closing: string;
    /** Characters Shift-Tab jumps before (searched to the left). */
    opening: string;
};

export const taboutConfig: TaboutConfig = {
    enabled: false,
    shiftTab: true,
    insertModeOnly: true,
    closing: ")]}>\"'`",
    opening: "([{<\"'`",
};

/**
 * Determine whether the given editor is currently in vim insert mode.
 *
 * Primary path uses the cm5 adapter exposed by `@replit/codemirror-vim`
 * (via `window.CodeMirrorAdapter.getCM`). Falls back to detecting the block
 * cursor the vim layer renders in non-insert modes, and finally
 * assumes insert mode so the feature still works if detection is unavailable.
 */
function isInsertMode(view: EditorView): boolean {
    const adapter = window.CodeMirrorAdapter;
    const cm = adapter?.getCM?.(view);
    const vimState = cm?.state?.vim;
    if (vimState && typeof vimState.insertMode === "boolean")
        return vimState.insertMode;

    // Fallback: the vim block cursor adds `cm-fat-cursor` in normal/visual
    // modes; not there means we're in insert mode.
    const hasFatCursor =
        view.dom.classList.contains("cm-fat-cursor") ||
        view.dom.querySelector(".cm-fat-cursor") !== null;
    return !hasFatCursor;
}

/** Tab forward: jump past the next closing character on the line. */
function tabOut(view: EditorView): boolean {
    const sel = view.state.selection.main;
    if (!sel.empty) return false;

    const pos = sel.head;
    const line = view.state.doc.lineAt(pos);
    const offset = pos - line.from;

    for (let i = offset; i < line.text.length; i++) {
        if (taboutConfig.closing.includes(line.text[i])) {
            const target = line.from + i + 1;
            view.dispatch({
                selection: EditorSelection.cursor(target),
                scrollIntoView: true,
            });
            return true;
        }
    }

    return false;
}

/** Shift-Tab: jump before the previous opening character on the line. */
function tabIn(view: EditorView): boolean {
    const sel = view.state.selection.main;
    if (!sel.empty) return false;

    const pos = sel.head;
    const line = view.state.doc.lineAt(pos);
    const offset = pos - line.from;

    for (let i = offset - 1; i >= 0; i--) {
        if (taboutConfig.opening.includes(line.text[i])) {
            const target = line.from + i;
            view.dispatch({
                selection: EditorSelection.cursor(target),
                scrollIntoView: true,
            });
            return true;
        }
    }

    return false;
}

function handle(view: EditorView, direction: "forward" | "backward"): boolean {
    if (!taboutConfig.enabled) return false;
    if (direction === "backward" && !taboutConfig.shiftTab) return false;
    if (taboutConfig.insertModeOnly && !isInsertMode(view)) return false;

    return direction === "forward" ? tabOut(view) : tabIn(view);
}

/**
 * The CodeMirror extension. Registered once in main;
 * behavior is gated through `taboutConfig`. Highest precedence so it
 * gets first at Tab before the default indent handling. Returns false when there is nothing to tab out of.
 */
export const taboutExtension: Extension = Prec.highest(
    keymap.of([
        { key: "Tab", run: (view) => handle(view, "forward") },
        { key: "Shift-Tab", run: (view) => handle(view, "backward") },
    ]),
);
