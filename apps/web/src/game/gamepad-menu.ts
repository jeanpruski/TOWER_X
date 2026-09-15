/** Navigate the active dialog with a standard controller, without sending game actions. */
export function gamepadMenu(dialog: HTMLDialogElement, close: () => void) {
  const readPad = () => Array.from(navigator.getGamepads?.() ?? []).find(pad => pad?.connected);
  let previous = readPad()?.buttons.map(button => button.pressed) ?? [];
  let direction = '', repeatAt = 0, frame = 0;
  const controls = () => [...dialog.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex="0"]')]
    .filter(element => !element.matches(':disabled, [hidden], [aria-hidden="true"]') && element.getClientRects().length > 0);
  const focus = (element: HTMLElement) => {
    dialog.querySelector('[data-pad-focus]')?.removeAttribute('data-pad-focus');
    element.dataset.padFocus = 'true'; element.focus({ preventScroll: true }); element.scrollIntoView({ block: 'nearest' });
  };
  const update = (time: number) => {
    frame = requestAnimationFrame(update);
    if (!dialog.open || document.hidden || [...document.querySelectorAll('dialog[open]')].at(-1) !== dialog) return;
    const pad = readPad();
    if (!pad) { previous = []; direction = ''; return; }
    const pressed = (index: number) => Boolean(pad.buttons[index]?.pressed);
    const edge = (index: number) => pressed(index) && !previous[index];
    const next = pressed(12) || (pad.axes[1] ?? 0) < -0.5 ? 'up' : pressed(13) || (pad.axes[1] ?? 0) > 0.5 ? 'down'
      : pressed(14) || (pad.axes[0] ?? 0) < -0.5 ? 'left' : pressed(15) || (pad.axes[0] ?? 0) > 0.5 ? 'right' : '';
    const items = controls(), active = document.activeElement as HTMLElement;
    if (next && (next !== direction || time >= repeatAt)) {
      repeatAt = time + (next !== direction ? 380 : 140);
      if (active instanceof HTMLInputElement && active.type === 'range' && (next === 'left' || next === 'right')) {
        const step = Number(active.step) || 1, value = Math.max(Number(active.min), Math.min(Number(active.max), Number(active.value) + (next === 'right' ? 1 : -1) * step * 5));
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(active, String(value));
        active.dispatchEvent(new Event('input', { bubbles: true }));
        active.dispatchEvent(new Event('change', { bubbles: true }));
        focus(active);
      } else if (items.length) {
        const index = items.indexOf(active), delta = next === 'up' || next === 'left' ? -1 : 1;
        focus(items[index < 0 ? 0 : (index + delta + items.length) % items.length]!);
      }
    }
    direction = next;
    const confirm = edge(0), back = edge(1) || edge(9);
    previous = pad.buttons.map(button => button.pressed);
    if (back || confirm) window.dispatchEvent(new Event('gamepadui'));
    if (back) {
      // Keyboard remapping can consume Back to cancel its pending capture first.
      if (dialog.dispatchEvent(new Event('gamepadback', { cancelable: true, bubbles: true }))) close();
    } else if (confirm) {
      if (items.includes(active)) { focus(active); active.click(); }
      else if (items[0]) focus(items[0]);
    }
  };
  frame = requestAnimationFrame(update);
  return () => cancelAnimationFrame(frame);
}
