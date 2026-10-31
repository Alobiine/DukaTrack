import { useEffect, type RefObject } from "react";
export function useModalFocus(
  active: string,
  ref: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!active || !ref.current) return;
    const root = ref.current,
      previous = document.activeElement as HTMLElement | null;
    const elements = () =>
      Array.from(
        root.querySelectorAll<HTMLElement>(
          'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"],summary',
        ),
      ).filter((x) => x.getClientRects().length);
    elements()[0]?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const list = elements(),
        first = list[0],
        last = list[list.length - 1];
      if (!first) {
        e.preventDefault();
        root.focus();
        return;
      }
      if (
        e.shiftKey &&
        (document.activeElement === first ||
          !root.contains(document.activeElement))
      ) {
        e.preventDefault();
        last.focus();
      } else if (
        !e.shiftKey &&
        (document.activeElement === last ||
          !root.contains(document.activeElement))
      ) {
        e.preventDefault();
        first.focus();
      }
    };
    const prior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    root.addEventListener("keydown", trap);
    return () => {
      root.removeEventListener("keydown", trap);
      document.body.style.overflow = prior;
      previous?.focus();
    };
  }, [active, ref]);
}
